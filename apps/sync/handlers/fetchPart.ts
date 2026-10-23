// T030: FetchPart (contracts/sync-pipeline.md). Fetches one manifest part per Step Functions Map
// iteration (infra/lib/crm-sync-stack.ts wires concurrency 2–3), verifying every downloaded byte
// against its CID's published sha256 before it is ever written to S3 (constitution P0-2). Tries
// CloudFront first, then Filebase, then Pinata (ADR-02) — never ipfs.io/dweb.link. Uses
// packages/config/gatewayPolicy.ts (T028) for the token-bucket + backoff policy. Content-addressed
// S3 write (`sha256(manifestCid + partPath)`, If-None-Match) is FetchPart's own idempotency
// boundary (T031/T032, FR-004) — BuildIndex never re-fetches or re-verifies these bytes
// (contracts/sync-pipeline.md's clean INDEX/SYNC seam).
import { createHash } from "node:crypto";
import {
  GATEWAY_ORDER,
  MAX_RETRIES_BEFORE_SWITCH,
  backoffDelayMs,
  createGatewayTokenBuckets,
  isRetryableStatus,
  type Gateway,
  type TokenBucket,
} from "@crm/config/gatewayPolicy.js";
import { withObservability } from "@crm/observability";

export interface FetchPartPart {
  readonly name: string;
  /** The part's path within the manifest's table/directory layout; also this story's content-
   * addressed S3 key input and the row this part's bytes ultimately become. */
  readonly path: string;
  readonly cid: string;
  readonly sha256: string;
}

export interface FetchPartInput {
  readonly manifestCid: string;
  readonly part: FetchPartPart;
}

export type FetchPartResult =
  | {
      readonly status: "verified";
      readonly partPath: string;
      readonly verifiedBytes: Uint8Array;
      readonly sha256: string;
      readonly s3Key: string;
      readonly written: boolean;
    }
  | {
      readonly status: "dlq";
      readonly partPath: string;
      readonly reason: "all_gateways_exhausted";
    };

export interface GatewayFetchResult {
  readonly ok: boolean;
  readonly status: number;
  readonly body?: Uint8Array;
}

export interface GatewayFetcher {
  readonly name: Gateway;
  fetch(cid: string): Promise<GatewayFetchResult>;
}

export interface S3ConditionalWriter {
  /** Writes `body` at `key` only if nothing is there yet (S3 `If-None-Match: *`). Returns
   * `written: false`, never throws, when the key already exists — AC-4's idempotent re-run. */
  putIfAbsent(key: string, body: Uint8Array): Promise<{ readonly written: boolean }>;
}

export interface FetchPartDeps {
  /** Ordered CloudFront -> Filebase -> Pinata (ADR-02); never ipfs.io/dweb.link. */
  readonly fetchers: readonly GatewayFetcher[];
  readonly s3: S3ConditionalWriter;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly tokenBuckets?: Readonly<Partial<Record<Gateway, TokenBucket>>>;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The idempotency key AC-4/FR-004 proves on: content-addressed, so a re-run of the same
 * manifestCid against the same part always resolves to the same S3 key (T031/T032). */
export function contentAddressedKey(manifestCid: string, partPath: string): string {
  return sha256Hex(Buffer.from(manifestCid + partPath, "utf8"));
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches and verifies one part, trying each gateway in ADR-02's fixed order with up to
 * `MAX_RETRIES_BEFORE_SWITCH` attempts (backoff + full jitter) before falling back to the next
 * gateway. A byte mismatch against the part's published sha256 is treated exactly like a failed
 * attempt — unverified bytes are never written to S3 or returned (constitution P0-2). When every
 * gateway's retries are exhausted, the part is handed back as `status: "dlq"` so the Step
 * Functions definition can route it to the DLQ queue without this handler needing to know about
 * SQS at all (contracts/sync-pipeline.md's clean seam).
 */
export async function fetchPart(
  input: FetchPartInput,
  deps: FetchPartDeps,
): Promise<FetchPartResult> {
  const sleep = deps.sleep ?? defaultSleep;

  for (const fetcher of deps.fetchers) {
    for (let attempt = 0; attempt < MAX_RETRIES_BEFORE_SWITCH; attempt++) {
      const bucket = deps.tokenBuckets?.[fetcher.name];
      if (bucket !== undefined && !bucket.tryAcquire()) {
        await sleep(backoffDelayMs(attempt, { random: deps.random }));
        continue;
      }

      let result: GatewayFetchResult;
      try {
        result = await fetcher.fetch(input.part.cid);
      } catch {
        result = { ok: false, status: 599 };
      }

      if (result.ok && result.body !== undefined) {
        const digest = sha256Hex(result.body);
        if (digest === input.part.sha256) {
          const s3Key = contentAddressedKey(input.manifestCid, input.part.path);
          const { written } = await deps.s3.putIfAbsent(s3Key, result.body);
          return {
            status: "verified",
            partPath: input.part.path,
            verifiedBytes: result.body,
            sha256: digest,
            s3Key,
            written,
          };
        }
        // sha256 mismatch: never returned as verified bytes — falls through to the retry path
        // below exactly like any other retryable failure.
      } else if (!isRetryableStatus(result.status) && result.status !== 599) {
        // A non-retryable response (e.g. 404) from this gateway: stop retrying it, move on.
        break;
      }

      if (attempt < MAX_RETRIES_BEFORE_SWITCH - 1) {
        await sleep(backoffDelayMs(attempt, { random: deps.random }));
      }
    }
    // This gateway's retries are exhausted (or it returned a non-retryable error) — ADR-02's
    // fallback to the next gateway in GATEWAY_ORDER.
  }

  return { status: "dlq", partPath: input.part.path, reason: "all_gateways_exhausted" };
}

const handlerName = "crm-sync-fetch-part";

/**
 * Production gateway fetcher: plain `fetch()` against a gateway's base URL. Base URLs are read
 * from the environment (never hard-coded — architecture-constitution.md §9's config boundary) and
 * are rejected at cold start if they resolve to ipfs.io/dweb.link (ADR-02's retired gateways),
 * so a misconfiguration is loud, not a silent policy violation.
 */
function createHttpGatewayFetcher(name: Gateway, baseUrl: string): GatewayFetcher {
  if (/ipfs\.io|dweb\.link/i.test(baseUrl)) {
    throw new Error(
      `gatewayPolicy: ${name} base URL "${baseUrl}" resolves to a retired gateway (ADR-02 forbids ipfs.io/dweb.link).`,
    );
  }
  return {
    name,
    async fetch(cid: string): Promise<GatewayFetchResult> {
      const response = await fetch(`${baseUrl}/ipfs/${cid}`);
      if (!response.ok) {
        return { ok: false, status: response.status };
      }
      const body = new Uint8Array(await response.arrayBuffer());
      return { ok: true, status: response.status, body };
    },
  };
}

/** Env var names for each gateway's base URL (never a hard-coded domain in code). */
const GATEWAY_BASE_URL_ENV: Record<Gateway, string> = {
  cloudfront: "GATEWAY_CLOUDFRONT_BASE_URL",
  filebase: "GATEWAY_FILEBASE_BASE_URL",
  pinata: "GATEWAY_PINATA_BASE_URL",
};

function productionFetchers(env: Record<string, string | undefined>): GatewayFetcher[] {
  return GATEWAY_ORDER.flatMap((gateway) => {
    const baseUrl = env[GATEWAY_BASE_URL_ENV[gateway]];
    if (baseUrl === undefined || baseUrl === "") return [];
    return [createHttpGatewayFetcher(gateway, baseUrl)];
  });
}

export const handler = withObservability(
  handlerName,
  async (event: FetchPartInput, obs): Promise<FetchPartResult> => {
    // Real S3 wiring (PutObject with IfNoneMatch, catching PreconditionFailed) lives in
    // apps/sync/src/s3PartWriter.ts (T031/T032's production S3ConditionalWriter) — imported
    // lazily here so this handler module stays importable (and its retry/fallback logic unit-
    // testable) without the AWS SDK's S3 client needing to resolve in every test run.
    const { createS3PartWriter } = await import("../src/s3PartWriter.js");
    const bucketName = process.env.CRM_INDEX_BUCKET_NAME;
    if (bucketName === undefined || bucketName === "") {
      throw new Error("CRM_INDEX_BUCKET_NAME is not set");
    }
    const result = await fetchPart(event, {
      fetchers: productionFetchers(process.env),
      s3: createS3PartWriter(bucketName),
      tokenBuckets: createGatewayTokenBuckets(),
    });
    if (result.status === "dlq") {
      obs.logger.error("part exhausted every gateway's retries; routing to DLQ", {
        partPath: result.partPath,
      });
    }
    return result;
  },
);
