// Validate (T019/T020a, INDEX group, espeon): reconciles BuildIndex's output row count against
// the manifest's published coverage, per contracts/sync-pipeline.md and data-model.md's
// index_meta/reconcile rules. Round 1 decision (2026-10-23): tightened to constitution §10's
// index-fidelity NFR — exact match or at most 0.1% of coverage.parcels_published, documented via
// `reconcileDiff`; anything larger is `Held`, never a silent pass.
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient, ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadS3ObjectToFile, withObservability, type Observability } from "@crm/observability";
import {
  IndexMeta,
  type CrmPermit,
  type CrmProperty,
  type IndexMetaHeldReason,
} from "@crm/index-schema";
import { createInMemoryConnection } from "../src/engine/duckdb.js";

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

/** BuildIndex's actual output, plus the pass-through fields it echoed from Plan/the Map
 *  (contracts/sync-pipeline.md's Validate input is BuildIndex's output verbatim). */
export interface ValidateEvent {
  manifestCid: string;
  bucket: string;
  propertyKey: string;
  permitKey: string;
  coverageParcelsPublished: number;
  finishedAt: string;
  anyPartUnverified: boolean;
}

const META_INDEX_PK = "META#index";
/** crm-leads has a pk+sk key (B-07); the pointer item lives at sk "META". */
const META_INDEX_SK = "META";

async function downloadToFile(s3: S3Client, bucket: string, key: string, destPath: string) {
  await downloadS3ObjectToFile(s3, bucket, key, destPath);
}

/**
 * Reads the previously *promoted* run's property count off a `META#index` DynamoDB item, the
 * same shape Promote (apps/sync/handlers/promote.ts) now writes `propertyCount`/`permitCount`/
 * `promotedAt` onto. Exported so a test can prove this reads back what Promote actually writes,
 * not just that both sides independently agree on a field name (CR-B-02 finding #1).
 */
export function extractPreviousPromotedPropertyCount(
  item: Record<string, unknown> | undefined,
): number | null {
  return item?.propertyCount === undefined ? null : Number(item.propertyCount);
}

/** Reads just enough of a written Parquet file to prove every row carries `sourceManifestCid`
 *  and to count rows — never a live re-fetch from Task A (BuildIndex already wrote these bytes;
 *  Validate only proves what landed, per contracts/sync-pipeline.md). */
async function readSourceManifestCids(
  connection: Awaited<ReturnType<typeof createInMemoryConnection>>,
  file: string,
  viewName: string,
): Promise<(string | null)[]> {
  await connection.run(`CREATE VIEW ${viewName} AS SELECT * FROM read_parquet('${file}')`);
  const reader = await connection.runAndReadAll(`SELECT sourceManifestCid FROM ${viewName}`);
  return (reader.getRowObjectsJS() as { sourceManifestCid: string | null }[]).map(
    (row) => row.sourceManifestCid,
  );
}

async function validateCoreFromEvent(
  event: ValidateEvent,
  _obs: Observability,
): Promise<IndexMeta> {
  const tmpDir = mkdtempSync(join(tmpdir(), "crm-validate-"));
  const s3 = new S3Client({});
  try {
    const propertyFile = join(tmpDir, "crm_property.parquet");
    const permitFile = join(tmpDir, "crm_permit.parquet");
    await downloadToFile(s3, event.bucket, event.propertyKey, propertyFile);
    await downloadToFile(s3, event.bucket, event.permitKey, permitFile);

    const connection = await createInMemoryConnection();
    try {
      const propertyCids = await readSourceManifestCids(connection, propertyFile, "crm_property");
      const permitCids = await readSourceManifestCids(connection, permitFile, "crm_permit");

      const tableName = process.env.CRM_LEADS_TABLE_NAME;
      if (tableName === undefined || tableName === "") {
        throw new Error("Validate: CRM_LEADS_TABLE_NAME is not set");
      }
      const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
      // crm-leads is B-07's table (architecture-constitution.md §9) — CrmSync only ever
      // references it by name, never creates it. In any environment where B-07 hasn't deployed
      // yet, this GetCommand throws ResourceNotFoundException; that is indistinguishable, for
      // Validate's purposes, from "no run has ever been promoted" (first_run), so it's treated
      // the same as a missing item rather than a crash.
      let previousPromotedPropertyCount: number | null;
      try {
        const pointer = await ddb.send(
          new GetCommand({ TableName: tableName, Key: { pk: META_INDEX_PK, sk: META_INDEX_SK } }),
        );
        previousPromotedPropertyCount = extractPreviousPromotedPropertyCount(pointer.Item);
      } catch (error) {
        if (error instanceof ResourceNotFoundException) {
          previousPromotedPropertyCount = null;
        } else {
          throw error;
        }
      }

      const input: ValidateInput = {
        manifestCid: event.manifestCid,
        // Only sourceManifestCid is actually read by validateCore (row count + provenance
        // check) — the rest of CrmProperty/CrmPermit's fields were already Zod-validated by
        // BuildIndex before these bytes were ever written, so re-parsing every column here
        // would just re-prove what already passed.
        properties: propertyCids.map((cid) => ({ sourceManifestCid: cid }) as CrmProperty),
        permits: permitCids.map((cid) => ({ sourceManifestCid: cid }) as CrmPermit),
        coverageParcelsPublished: event.coverageParcelsPublished,
        previousPromotedPropertyCount,
        anyPartUnverified: event.anyPartUnverified,
        finishedAt: event.finishedAt,
      };
      return validateCore(input);
    } finally {
      connection.closeSync();
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export const validateHandler = withObservability("Validate", validateCoreFromEvent);
