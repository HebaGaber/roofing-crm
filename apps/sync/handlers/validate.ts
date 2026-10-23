// Validate (T019/T020a, INDEX group, espeon): reconciles BuildIndex's output row count against
// the manifest's published coverage, per contracts/sync-pipeline.md and data-model.md's
// index_meta/reconcile rules. Round 1 decision (2026-10-23): tightened to constitution §10's
// index-fidelity NFR — exact match or at most 0.1% of coverage.parcels_published, documented via
// `reconcileDiff`; anything larger is `Held`, never a silent pass.
import { withObservability } from "@crm/observability";
import {
  IndexMeta,
  type CrmPermit,
  type CrmProperty,
  type IndexMetaHeldReason,
} from "@crm/index-schema";

/** Constitution §10 / Round 1 decision, 2026-10-23: a reconcile diff over 0.1% of the manifest's
 *  published coverage count fails outright — it is never a documented pass. */
const RECONCILE_TOLERANCE_FRACTION = 0.001;
/** spec.md's edge case / data-model.md's state transitions: a drop of more than 5% from the
 *  previously promoted run's count holds for operator review, never silently promotes. */
const DROP_HOLD_FRACTION = 0.05;

export interface ValidateInput {
  manifestCid: string;
  properties: CrmProperty[];
  permits: CrmPermit[];
  /** The manifest's own `coverage.parcels_published.count` (never a live recount of Task A's
   *  data — this story reads it from the manifest it already fetched in Plan/BuildIndex). */
  coverageParcelsPublished: number;
  /** The previously *promoted* run's property count, or null on a first run (no prior run to
   *  compare against — spec.md's Assumptions: "first_run" is itself one of Task A's own missing
   *  reasons, not invented here). */
  previousPromotedPropertyCount: number | null;
  /** T020/T020a: true when FetchPart routed any part of this run to the DLQ as unverified. A
   *  run is never promoted with one unverified part, even if every other part verified and the
   *  row-count drop is within tolerance (constitution P0-2). */
  anyPartUnverified: boolean;
  finishedAt: string;
}

function heldResult(
  input: ValidateInput,
  heldReason: IndexMetaHeldReason,
  reconcileDiff: number | null = null,
): IndexMeta {
  return IndexMeta.parse({
    manifestCid: input.manifestCid,
    status: "Held",
    propertyCount: input.properties.length,
    permitCount: input.permits.length,
    reconcileDiff,
    heldReason,
    finishedAt: input.finishedAt,
  });
}

/** The pure reconciliation core (no AWS I/O) — directly testable with a fixture ValidateInput. */
export function validateCore(input: ValidateInput): IndexMeta {
  // T020a: checked first, before any row-count evaluation at all — a run is never promoted with
  // an unverified part regardless of how the counts otherwise reconcile.
  if (input.anyPartUnverified) {
    return heldResult(input, "unverified_part");
  }

  // 0 rows without sourceManifestCid (FR-001/constitution P0-3) — defensive: BuildIndex's own
  // Zod schema already requires this field on every row, so a violation here would mean a bug
  // upstream, not a normal Held path. Fails loud rather than silently promoting a gap in
  // provenance.
  const missingProvenance =
    input.properties.some((p) => !p.sourceManifestCid) ||
    input.permits.some((p) => !p.sourceManifestCid);
  if (missingProvenance) {
    throw new Error(
      "Validate: a row is missing sourceManifestCid — BuildIndex's own contract was violated",
    );
  }

  const propertyCount = input.properties.length;

  if (
    input.previousPromotedPropertyCount !== null &&
    propertyCount < input.previousPromotedPropertyCount * (1 - DROP_HOLD_FRACTION)
  ) {
    return heldResult(input, "drop_over_5_percent");
  }

  const reconcileDiff = Math.abs(propertyCount - input.coverageParcelsPublished);
  if (reconcileDiff === 0) {
    return IndexMeta.parse({
      manifestCid: input.manifestCid,
      status: "Validated",
      propertyCount,
      permitCount: input.permits.length,
      reconcileDiff: 0,
      heldReason: null,
      finishedAt: input.finishedAt,
    });
  }

  const diffFraction =
    input.coverageParcelsPublished > 0 ? reconcileDiff / input.coverageParcelsPublished : 1;
  if (diffFraction <= RECONCILE_TOLERANCE_FRACTION) {
    return IndexMeta.parse({
      manifestCid: input.manifestCid,
      status: "Validated",
      propertyCount,
      permitCount: input.permits.length,
      reconcileDiff,
      heldReason: null,
      finishedAt: input.finishedAt,
    });
  }

  return heldResult(input, "reconcile_diff_exceeds_tolerance", reconcileDiff);
}

export const validateHandler = withObservability("Validate", async (event: ValidateInput) =>
  validateCore(event),
);
