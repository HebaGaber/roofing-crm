// Plan (T024, INDEX group, espeon): resolves the authoritative manifestCid, checks every
// profiles[].sha256 against the vendored packages/oracle-contract/oracle-views copy's own digest
// (ADR-07's drift guard — holds, never throws uncaught, on a mismatch), and the cost-gate check
// sized from the manifest's own declared byte size (never a live HEAD request, machamp's
// refinement in research.md). Records this run's start timestamp, read back by Promote (T022) to
// compute SyncDurationMs — a cross-task data dependency threaded through the Step Functions
// execution payload, not a side read.
import { withObservability, type Observability } from "@crm/observability";
import { RunManifestV1 } from "@crm/oracle-contract";
import { PROFILE } from "@crm/oracle-profile-travis-austin";
import { gazetteer } from "@crm/oracle-views";
import type { IndexMetaHeldReason } from "@crm/index-schema";
import { contentAddressedKey } from "./fetchPart.js";
import { estimateCostFromManifest, evaluateCostGate } from "./costGate.js";

/** The manifest's own downloadable data files (`kind: "table"` — never the `car`/`directory`
 *  container-level artifacts, which nothing in this pipeline fetches directly). FetchPart's Map
 *  iterates this list, one per Step Functions Map item (contracts/sync-pipeline.md). */
const PART_KIND = "table";

const PLACES_PROFILE_NAME = "travis-places";

const FETCH_TIMEOUT_MS = 15_000;

/** Env var names for each gateway's base URL — the same names infra/lib/crm-sync-stack.ts wires
 *  onto both PlanFunction and FetchPartFunction (never a hard-coded domain here). CloudFront is
 *  tried first per ADR-02; an unset GATEWAY_CLOUDFRONT_BASE_URL (e.g. in a local/test run where
 *  the stack hasn't wired it) just skips straight to Filebase/Pinata rather than failing. */
const GATEWAY_BASE_URL_ENV = {
  cloudfront: "GATEWAY_CLOUDFRONT_BASE_URL",
  filebase: "GATEWAY_FILEBASE_BASE_URL",
  pinata: "GATEWAY_PINATA_BASE_URL",
} as const;

/** CloudFront serves Task A's CID copy at `/{cid}` directly (confirmed live, run-log.md Stage 0
 *  A1) — not the `/ipfs/{cid}` path every always-public gateway (Filebase, Pinata) uses. */
function gatewayManifestUrl(
  gateway: keyof typeof GATEWAY_BASE_URL_ENV,
  baseUrl: string,
  cid: string,
): string {
  return gateway === "cloudfront" ? `${baseUrl}/${cid}` : `${baseUrl}/ipfs/${cid}`;
}

/** ADR-02's fixed fallback order for the one lightweight fetch Plan needs (the manifest JSON
 *  only — never the 23 table parts; that network boundary belongs entirely to FetchPart/machamp).
 *  Falls back to Filebase's/Pinata's always-public default base URLs when the stack hasn't set
 *  their env vars (local dev, tests) — CloudFront has no such default since it is Task A's own
 *  deployed distribution, not a generic public gateway. */
function manifestGatewayUrls(cid: string): string[] {
  const cloudfrontBase = process.env[GATEWAY_BASE_URL_ENV.cloudfront];
  const filebaseBase = process.env[GATEWAY_BASE_URL_ENV.filebase] ?? "https://ipfs.filebase.io";
  const pinataBase = process.env[GATEWAY_BASE_URL_ENV.pinata] ?? "https://gateway.pinata.cloud";
  const urls: string[] = [];
  if (cloudfrontBase !== undefined && cloudfrontBase !== "") {
    urls.push(gatewayManifestUrl("cloudfront", cloudfrontBase, cid));
  }
  urls.push(gatewayManifestUrl("filebase", filebaseBase, cid));
  urls.push(gatewayManifestUrl("pinata", pinataBase, cid));
  return urls;
}

export interface PlanCostEstimate {
  predictedSpendUsd: number;
  predictedDocCount: number;
  predictedBytes: number;
}

export interface PlanProfileRef {
  name: string;
  version: string;
  sha256: string;
}

/** One manifest table artifact FetchPart will fetch. `path` doubles as this story's content-
 *  addressed S3 key input (`sha256(manifestCid + path)`, shared with FetchPart) and the row
 *  BuildIndex writes the downloaded bytes to under its local tablesDir layout. */
export interface PlanPart {
  name: string;
  path: string;
  cid: string;
  sha256: string;
}

export interface PlanResult {
  // Present (undefined) so callers (and T008's own fixture test) can read `.status`/
  // `.heldReason` off the PlanResult | PlanHeld union without narrowing first.
  status?: undefined;
  heldReason?: undefined;
  manifestCid: string;
  /** The S3 bucket every later step (FetchPart, BuildIndex, Validate) reads/writes. */
  bucket: string;
  /** S3 key of the verified manifest JSON bytes, written by this step (BuildIndex downloads it
   *  from here rather than re-fetching from a gateway). */
  manifestKey: string;
  parts: PlanPart[];
  profiles: PlanProfileRef[];
  costEstimate: PlanCostEstimate;
  /** This run's start timestamp — Promote (T022) reads this back to compute SyncDurationMs. */
  startedAt: string;
  /** The manifest's own `coverage.parcels_published.count` — Validate (T019) reconciles
   *  BuildIndex's row count against this, never a live recount of Task A's data. */
  coverageParcelsPublished: number;
  /** The manifest's own `finishedAt` — carried through to Validate/Promote's `IndexMeta` rather
   *  than generated fresh at each later step. */
  finishedAt: string;
}

export interface PlanHeld {
  status: "Held";
  heldReason: IndexMetaHeldReason;
  manifestCid: string;
}

export interface PlanInput {
  manifestCidHint?: string;
  /** Test-only: forces the digest guard to see a mismatch, without needing a crafted manifest. */
  __testForceDigestMismatch?: boolean;
}

async function fetchManifestBytes(cid: string): Promise<Uint8Array> {
  let lastError: unknown;
  for (const url of manifestGatewayUrls(cid)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Plan: every gateway failed for manifest ${cid}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function planCore(input: PlanInput, obs: Observability): Promise<PlanResult | PlanHeld> {
  const manifestCid = input.manifestCidHint;
  if (manifestCid === undefined || manifestCid === "") {
    throw new Error(
      "Plan: no manifestCidHint given (the SSM-pinned authority is read at deploy time, not by this handler directly)",
    );
  }

  const manifestBytes = await fetchManifestBytes(manifestCid);
  const manifest = RunManifestV1.parse(JSON.parse(new TextDecoder().decode(manifestBytes)));

  const rulesProfile = manifest.profiles.find((p) => p.name === PROFILE.name);
  const placesProfile = manifest.profiles.find((p) => p.name === PLACES_PROFILE_NAME);

  const digestMismatch =
    input.__testForceDigestMismatch === true ||
    rulesProfile === undefined ||
    rulesProfile.sha256 !== PROFILE.sha256 ||
    rulesProfile.version !== PROFILE.version ||
    placesProfile === undefined ||
    placesProfile.sha256 !== gazetteer.GAZETTEER.sha256;

  if (digestMismatch) {
    obs.logger.warn("Plan: held, profile digest mismatch against the vendored copy", {
      manifestCid,
    });
    return { status: "Held", heldReason: "digest_mismatch", manifestCid };
  }

  // CR-B-02 finding #3: this was a second, diverging implementation of the cost gate (its own
  // USD_PER_BYTE constant, ~6x stricter than costGate.ts's) — costGate.ts's
  // estimateCostFromManifest/evaluateCostGate is now the one place this math lives; Plan just
  // calls it, same as it calls the digest guard above.
  const { predictedSpendUsd, predictedDocCount, predictedBytes } =
    estimateCostFromManifest(manifest);
  const costGateResult = evaluateCostGate({ predictedSpendUsd, predictedDocCount, predictedBytes });

  if (costGateResult.held) {
    obs.logger.warn("Plan: held, predicted cost exceeds the cost gate", {
      manifestCid,
      predictedSpendUsd,
      predictedDocCount,
      predictedBytes,
    });
    return { status: "Held", heldReason: costGateResult.heldReason, manifestCid };
  }

  const bucket = process.env.CRM_INDEX_BUCKET_NAME;
  if (bucket === undefined || bucket === "") {
    throw new Error("Plan: CRM_INDEX_BUCKET_NAME is not set");
  }
  const manifestKey = contentAddressedKey(manifestCid, "manifest.json");
  // Content-addressed, If-None-Match write — same idempotency boundary as FetchPart's own parts
  // (AC-4/FR-004): a re-run against an already-indexed manifestCid writes this key once, not
  // twice (apps/sync/src/s3PartWriter.ts's PreconditionFailed → written:false, never thrown).
  const { createS3PartWriter } = await import("../src/s3PartWriter.js");
  await createS3PartWriter(bucket).putIfAbsent(manifestKey, manifestBytes);

  const parts: PlanPart[] = manifest.artifacts
    .filter((artifact) => artifact.kind === PART_KIND)
    .map((artifact) => ({
      name: artifact.name,
      path: artifact.name,
      cid: artifact.cid,
      sha256: artifact.sha256,
    }));

  return {
    manifestCid,
    bucket,
    manifestKey,
    parts,
    profiles: manifest.profiles.map((p) => ({
      name: p.name,
      version: p.version,
      sha256: p.sha256,
    })),
    costEstimate: { predictedSpendUsd, predictedDocCount, predictedBytes },
    startedAt: new Date().toISOString(),
    coverageParcelsPublished: manifest.coverage.parcels_published?.count ?? 0,
    finishedAt: manifest.finishedAt,
  };
}

export const planHandler = withObservability("Plan", planCore);
