// BuildIndex (T015/T017, INDEX group, espeon): the one step the contract forbids from making any
// network call to Task A or a gateway (contracts/sync-pipeline.md). It receives this run's
// already-verified parts (fetched and sha256-checked by FetchPart, machamp's step) from S3,
// binds them with vendored packages/oracle-views' bindManifest() (never re-deriving
// status_class/open_days/roof age — ADR-07), and Zod-validates every row against
// packages/index-schema before it is ever written out as crm_property/crm_permit Parquet.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createInMemoryConnection } from "../src/engine/duckdb.js";
import { contentAddressedKey } from "./fetchPart.js";
import { withObservability, type Observability } from "@crm/observability";
import { CrmPermit, CrmProperty, type Missing } from "@crm/index-schema";
import { bindManifest } from "@crm/oracle-views";
import type { QueryEngine, Row } from "@crm/oracle-views";

/** One row of the bound v_property view, as DuckDB returns it (snake_case, verbatim column
 *  names from packages/oracle-contract/src/columns.ts). */
export type ViewRow = Record<string, unknown>;

/** DuckDB column types for `read_json`, matching packages/index-schema's CrmProperty/CrmPermit
 *  shape exactly. Without this, `read_json_auto` infers BIGINT for whole numbers and
 *  DATE/TIMESTAMP for ISO date strings, so the port reads back `bigint`/`Date` values that fail
 *  CrmProperty/CrmPermit's `number`/`string` validation (found in T040's query.test.ts). */
const MISSING_STRUCT_LIST = "STRUCT(field VARCHAR, reason VARCHAR)[]";

export const CRM_PROPERTY_COLUMNS: Record<string, string> = {
  propertyCid: "VARCHAR",
  requestIdentifier: "VARCHAR",
  latitude: "DOUBLE",
  longitude: "DOUBLE",
  coordinateSource: "VARCHAR",
  propertyType: "VARCHAR",
  propertyUsageType: "VARCHAR",
  roofAgeYears: "INTEGER",
  roofAgeBasis: "VARCHAR",
  roofAgeConfidence: "VARCHAR",
  isLongTenure: "BOOLEAN",
  ownerKind: "VARCHAR",
  ownerAreaClass: "VARCHAR",
  ownerIsOutOfArea: "BOOLEAN",
  sourceManifestCid: "VARCHAR",
  missingReasons: MISSING_STRUCT_LIST,
  capturedAt: "VARCHAR",
  cid: "VARCHAR",
  runId: "VARCHAR",
};

export const CRM_PERMIT_COLUMNS: Record<string, string> = {
  propertyCid: "VARCHAR",
  permitCid: "VARCHAR",
  jurisdiction: "VARCHAR",
  permitNumber: "VARCHAR",
  improvementType: "VARCHAR",
  improvementAction: "VARCHAR",
  improvementStatus: "VARCHAR",
  statusClass: "VARCHAR",
  issueDate: "VARCHAR",
  finalDate: "VARCHAR",
  permitCloseDate: "VARCHAR",
  finalInspectionDate: "VARCHAR",
  openDays: "INTEGER",
  contractorResolution: "VARCHAR",
  contractorCompanyCid: "VARCHAR",
  sourceManifestCid: "VARCHAR",
  missingReasons: MISSING_STRUCT_LIST,
  capturedAt: "VARCHAR",
  cid: "VARCHAR",
  runId: "VARCHAR",
};

export function duckDbColumnsClause(columns: Record<string, string>): string {
  const entries = Object.entries(columns).map(([name, type]) => `${name}: '${type}'`);
  return `{${entries.join(", ")}}`;
}

function asMissing(value: unknown): Missing[] {
  if (!Array.isArray(value)) return [];
  return value.map((m) => {
    const entry = m as { field: string; reason: string };
    return { field: entry.field, reason: entry.reason as Missing["reason"] };
  });
}

/** DuckDB returns TIMESTAMP/DATE columns from v_property/v_roofing_permit as native JS `Date`
 *  objects, but every date-ish CrmProperty/CrmPermit field is a plain string (ISO 8601, carried
 *  verbatim from the source) — found live (ZodError on BuildIndex's first real run). */
function isoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : (value as string);
}

function nullableIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return isoString(value);
}

/**
 * Maps one bound v_property row into the CRM's own CrmProperty shape and Zod-validates it.
 * Every field not carried into data-model.md's crm_property table (parcel_identifier,
 * property_structure_built_year, last_ownership_transfer_date, tenure_years, tenure_basis,
 * owner_name, area_list_sha256) is dropped here on purpose — never copied, per ADR-03 for
 * owner_name specifically and per data-model.md's slimmer field list for the rest. A null field
 * keeps its exact missing reason (row.missing, verbatim) — this function never guesses or
 * interpolates a replacement value (FR-003).
 */
export function mapPropertyRow(row: ViewRow, sourceManifestCid: string): CrmProperty {
  return CrmProperty.parse({
    propertyCid: row.property_cid,
    requestIdentifier: row.request_identifier,
    latitude: row.latitude,
    longitude: row.longitude,
    coordinateSource: row.coordinate_source,
    propertyType: row.property_type,
    propertyUsageType: row.property_usage_type,
    roofAgeYears: row.roof_age_years,
    roofAgeBasis: row.roof_age_basis,
    roofAgeConfidence: row.roof_age_confidence,
    isLongTenure: row.is_long_tenure,
    ownerKind: row.owner_kind,
    ownerAreaClass: row.owner_area_class,
    ownerIsOutOfArea: row.owner_is_out_of_area,
    sourceManifestCid,
    missingReasons: asMissing(row.missing),
    capturedAt: isoString(row.captured_at),
    cid: row.cid,
    runId: row.run_id,
  });
}

/** Maps one bound v_roofing_permit row into CrmPermit. statusClass/isOpen are read verbatim from
 *  the vendored query-core derivation — never recomputed here (contracts/lead-index-port.md). */
export function mapPermitRow(row: ViewRow, sourceManifestCid: string): CrmPermit {
  return CrmPermit.parse({
    propertyCid: row.property_cid,
    permitCid: row.permit_cid,
    jurisdiction: row.jurisdiction,
    permitNumber: row.permit_number,
    improvementType: row.improvement_type,
    improvementAction: row.improvement_action,
    improvementStatus: row.improvement_status,
    statusClass: row.status_class,
    issueDate: nullableIsoString(row.issue_date),
    finalDate: nullableIsoString(row.final_date),
    permitCloseDate: nullableIsoString(row.permit_close_date),
    finalInspectionDate: nullableIsoString(row.final_inspection_date),
    openDays: row.open_days,
    contractorResolution: row.contractor_resolution,
    contractorCompanyCid: row.contractor_company_cid,
    sourceManifestCid,
    missingReasons: asMissing(row.missing),
    capturedAt: isoString(row.captured_at),
    cid: row.cid,
    runId: row.run_id,
  });
}

export interface BuildIndexResult {
  properties: CrmProperty[];
  permits: CrmPermit[];
}

/**
 * The network-free core (contracts/sync-pipeline.md: "Must not make any network call to Task A
 * or any gateway"): given an already-bound QueryEngine (BuildIndex's caller has already loaded
 * this run's verified parts into it — no fetch happens in here, by construction, since `engine`
 * only ever runs SQL against whatever DuckDB already has loaded locally), reads v_property and
 * v_roofing_permit and maps+validates every row.
 */
export async function buildIndexCore(
  engine: QueryEngine,
  sourceManifestCid: string,
): Promise<BuildIndexResult> {
  const propertyRows = (await engine.all("SELECT * FROM v_property")) as Row[];
  const permitRows = (await engine.all("SELECT * FROM v_roofing_permit")) as Row[];
  return {
    properties: propertyRows.map((row) => mapPropertyRow(row, sourceManifestCid)),
    permits: permitRows.map((row) => mapPermitRow(row, sourceManifestCid)),
  };
}

export interface BuildIndexPart {
  /** e.g. tables/county/property/part-00000.parquet (Plan's PlanPart.path, verbatim). */
  path: string;
}

export interface BuildIndexEvent {
  bucket: string;
  manifestCid: string;
  /** S3 key of the raw manifest JSON bytes, already verified by FetchPart. */
  manifestKey: string;
  /** This run's verified table parts (Plan.parts, the same list FetchPart's Map iterated over).
   *  Each part's S3 key is derived here with the identical content-addressed formula FetchPart
   *  used to write it (`sha256(manifestCid + path)`) — never a separately-recorded key, so the
   *  two steps can never drift out of sync on where a part actually landed. */
  parts: BuildIndexPart[];
  /** Plan's own values, echoed into BuildIndexOutput below purely as pass-through state (the
   *  Step Functions payload replaces itself at every LambdaInvoke's outputPath, so anything
   *  Validate needs has to ride through this step, not just Plan's). */
  coverageParcelsPublished: number;
  finishedAt: string;
  /** The FetchPartsMap's per-item results (one per part) — present only because the state
   *  machine keeps the Map's output rather than discarding it. Reduced to `anyPartUnverified`
   *  below; BuildIndex never otherwise reads these. */
  fetchResults?: { status: string }[];
}

export interface BuildIndexOutput {
  manifestCid: string;
  propertyCount: number;
  permitCount: number;
  propertyKey: string;
  permitKey: string;
  coverageParcelsPublished: number;
  finishedAt: string;
  /** T020a: true when any part in this run was routed to the DLQ as unverified — Validate holds
   *  the whole run on this signal alone, before evaluating row counts (constitution P0-2). */
  anyPartUnverified: boolean;
}

const s3 = new S3Client({});

async function downloadToFile(bucket: string, key: string, destPath: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body;
  if (body === undefined) throw new Error(`BuildIndex: S3 object ${key} has no body`);
  await pipeline(body as NodeJS.ReadableStream, createWriteStream(destPath));
}

/** `tables/county/property/part-00000.parquet` -> `{group}/{table}/{part}`, the local layout
 *  bindManifest's default partUrl expects under `tablesDir`. */
function localPartPath(path: string): string {
  const match = /tables\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
  if (!match)
    throw new Error(`BuildIndex: part path "${path}" is not tables/{group}/{table}/{part}`);
  const [, group, table, part] = match;
  return join(String(group), String(table), String(part));
}

async function buildIndexCoreFromEvent(
  event: BuildIndexEvent,
  obs: Observability,
): Promise<BuildIndexOutput> {
  const tmpDir = mkdtempSync(join(tmpdir(), "crm-build-index-"));
  const connection = await createInMemoryConnection();
  try {
    await connection.run("SET TimeZone = 'UTC'");
    const engine: QueryEngine = {
      run: async (sql: string) => {
        await connection.run(sql);
      },
      all: async (sql: string) => {
        const reader = await connection.runAndReadAll(sql);
        return reader.getRowObjectsJS() as Row[];
      },
    };

    const manifestPath = join(tmpDir, "manifest.json");
    await downloadToFile(event.bucket, event.manifestKey, manifestPath);
    const manifestBytes = new Uint8Array(await readFile(manifestPath));

    for (const part of event.parts) {
      const relative = localPartPath(part.path);
      const destPath = join(tmpDir, relative);
      await mkdir(join(destPath, ".."), { recursive: true });
      const s3Key = contentAddressedKey(event.manifestCid, part.path);
      await downloadToFile(event.bucket, s3Key, destPath);
    }

    await bindManifest(manifestBytes, tmpDir, engine);
    const { properties, permits } = await buildIndexCore(engine, event.manifestCid);
    obs.logger.info("BuildIndex: rows mapped and validated", {
      propertyCount: properties.length,
      permitCount: permits.length,
    });

    // Write the already-validated CrmProperty/CrmPermit rows (camelCase, index-schema shape) —
    // never the raw view rows — as Parquet, via a JSON round-trip DuckDB reads back typed.
    const propertyJson = join(tmpDir, "crm_property.json");
    const permitJson = join(tmpDir, "crm_permit.json");
    await writeFile(propertyJson, JSON.stringify(properties));
    await writeFile(permitJson, JSON.stringify(permits));

    const propertyFile = join(tmpDir, "crm_property.parquet");
    const permitFile = join(tmpDir, "crm_permit.parquet");
    await connection.run(
      `COPY (SELECT * FROM read_json('${propertyJson}', columns = ${duckDbColumnsClause(CRM_PROPERTY_COLUMNS)})) TO '${propertyFile}' (FORMAT parquet)`,
    );
    await connection.run(
      `COPY (SELECT * FROM read_json('${permitJson}', columns = ${duckDbColumnsClause(CRM_PERMIT_COLUMNS)})) TO '${permitFile}' (FORMAT parquet)`,
    );

    const propertyKey = `index/${event.manifestCid}/crm_property.parquet`;
    const permitKey = `index/${event.manifestCid}/crm_permit.parquet`;
    await s3.send(
      new PutObjectCommand({
        Bucket: event.bucket,
        Key: propertyKey,
        Body: await readFile(propertyFile),
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: event.bucket,
        Key: permitKey,
        Body: await readFile(permitFile),
      }),
    );

    return {
      manifestCid: event.manifestCid,
      propertyCount: properties.length,
      permitCount: permits.length,
      propertyKey,
      permitKey,
      coverageParcelsPublished: event.coverageParcelsPublished,
      finishedAt: event.finishedAt,
      anyPartUnverified: (event.fetchResults ?? []).some((r) => r.status === "dlq"),
    };
  } finally {
    connection.closeSync();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export const buildIndexHandler = withObservability("BuildIndex", buildIndexCoreFromEvent);
