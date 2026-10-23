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

/** The manifest's own downloadable data files (`kind: "table"` — never the `car`/`directory`
 *  container-level artifacts, which nothing in this pipeline fetches directly). FetchPart's Map
 *  iterates this list, one per Step Functions Map item (contracts/sync-pipeline.md). */
const PART_KIND = "table";

const PLACES_PROFILE_NAME = "travis-places";

// ADR-02's gateway order for the one lightweight fetch Plan needs (the manifest JSON only — never
// the 23 table parts; that network boundary belongs entirely to FetchPart/machamp).
const GATEWAYS = ["https://ipfs.filebase.io/ipfs", "https://gateway.pinata.cloud/ipfs"];
const FETCH_TIMEOUT_MS = 15_000;

// ADR-05's cost gate: hold promotion above $1.00 predicted spend, 600,000 predicted documents, or
// 2 GB predicted download — sized from the manifest's own declared `artifacts[].size`, never a
// live HEAD request.
const COST_GATE = { maxSpendUsd: 1, maxDocCount: 600_000, maxBytes: 2 * 1024 ** 3 };
// A documented placeholder unit-cost basis for Plan's own early estimate (machamp's costGate.ts,
// T036, is the authoritative gate re-checked with the same manifest-declared bytes; this is not a
// real billing figure).
const USD_PER_BYTE = 5e-10;

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
  path: string;
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
  for (const base of GATEWAYS) {
    try {
      const res = await fetch(`${base}/${cid}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${base}`);
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

  const predictedBytes = manifest.artifacts.reduce((sum, a) => sum + a.size, 0);
  const predictedDocCount =
    (manifest.coverage.parcels_published?.count ?? 0) +
    (manifest.coverage.permits_emitted?.count ?? 0);
  const predictedSpendUsd = predictedBytes * USD_PER_BYTE;

  if (
    predictedSpendUsd > COST_GATE.maxSpendUsd ||
    predictedDocCount > COST_GATE.maxDocCount ||
    predictedBytes > COST_GATE.maxBytes
  ) {
    obs.logger.warn("Plan: held, predicted cost exceeds the cost gate", {
      manifestCid,
      predictedSpendUsd,
      predictedDocCount,
      predictedBytes,
    });
    return { status: "Held", heldReason: "cost_gate_exceeded", manifestCid };
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
    .map((artifact) => ({ path: artifact.name }));

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
  };
}

export const planHandler = withObservability("Plan", planCore);
