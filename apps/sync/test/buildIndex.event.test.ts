// Covers BuildIndex's event-driven wrapper (apps/sync/handlers/buildIndex.ts,
// buildIndexCoreFromEvent / buildIndexHandler, lines ~233-330), which the fixture-engine tests in
// buildIndex.test.ts deliberately skip (per that file's own comment: "it proves the
// mapping/validation core, not the S3/DuckDB plumbing around it"). This file exercises that
// plumbing instead: downloading the manifest + verified parts from S3, binding them (bindManifest
// is stubbed here so this stays a unit test, not a full Oracle-profile fixture build), running the
// real in-memory DuckDB connection (src/engine/duckdb.ts) to map+validate rows and actually write
// Parquet via `COPY ... TO ... (FORMAT parquet)`, then uploading both files back to S3.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryEngine } from "@crm/oracle-views";

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";
const PROPERTY_CID = "baguqeeraqc3y3bh65rbd42zgdrkctaulckvvidmgb52pghyansb43vumoh6q";
const PERMIT_CID = "baguqeeraqxod4kdmjfpzqdu36b5jyvb5fe4mdlmvxolgukqvugex7hkwgdtq";
const RUN_CID = "bafkreihkjrwg3dobc3emke5j5q2xk63746pxjhg6galvr5kibcseboc6ha";

// bindManifest is the heavy Oracle-profile machinery (manifest schema validation against the
// vendored profile digest) — out of scope here (owned/tested by packages/oracle-views). BuildIndex
// only ever calls it and then queries whatever views it created, so a stub that creates the same
// v_property/v_roofing_permit shape directly in the real DuckDB connection proves BuildIndex's own
// orchestration (download -> bind -> map/validate -> write Parquet -> upload) without re-testing
// bindManifest's internals.
vi.mock("@crm/oracle-views", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@crm/oracle-views")>();
  return {
    ...actual,
    bindManifest: vi.fn(
      async (_manifestBytes: Uint8Array, _tablesDir: string, engine: QueryEngine) => {
        await engine.run(`
        CREATE VIEW v_property AS SELECT
          '${PROPERTY_CID}' AS property_cid,
          '0208011301' AS request_identifier,
          30.26 AS latitude,
          -97.74 AS longitude,
          'gis_centroid' AS coordinate_source,
          'SingleFamily' AS property_type,
          'Residential' AS property_usage_type,
          18 AS roof_age_years,
          'built_year' AS roof_age_basis,
          'low' AS roof_age_confidence,
          CAST(NULL AS BOOLEAN) AS is_long_tenure,
          CAST(NULL AS VARCHAR) AS owner_kind,
          'unknown' AS owner_area_class,
          CAST(NULL AS BOOLEAN) AS owner_is_out_of_area,
          []::STRUCT(field VARCHAR, reason VARCHAR)[] AS missing,
          TIMESTAMP '2026-10-21 10:35:59.798' AS captured_at,
          '${RUN_CID}' AS cid,
          'travis-202609-permits-20261021t103516z' AS run_id
      `);
        await engine.run(`
        CREATE VIEW v_roofing_permit AS SELECT
          '${PROPERTY_CID}' AS property_cid,
          '${PERMIT_CID}' AS permit_cid,
          'austin' AS jurisdiction,
          '2026-123456 RP' AS permit_number,
          'Roofing' AS improvement_type,
          'Replacement' AS improvement_action,
          'Completed' AS improvement_status,
          'closed' AS status_class,
          '2026-09-02' AS issue_date,
          '2026-09-10' AS final_date,
          '2026-09-10' AS permit_close_date,
          '2026-09-10' AS final_inspection_date,
          8 AS open_days,
          'resolved' AS contractor_resolution,
          CAST(NULL AS VARCHAR) AS contractor_company_cid,
          []::STRUCT(field VARCHAR, reason VARCHAR)[] AS missing,
          TIMESTAMP '2026-10-21 10:35:59.798' AS captured_at,
          '${RUN_CID}' AS cid,
          'travis-202609-permits-20261021t103516z' AS run_id
      `);
        return {} as never;
      },
    ),
  };
});

const { buildIndexHandler } = await import("../handlers/buildIndex.js");

const s3Mock = mockClient(S3Client);

function manifestGetResponse() {
  return { Body: Readable.from([Buffer.from("{}")]) };
}

describe("BuildIndex: event-driven handler (S3 download/upload, real DuckDB, real Parquet write)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand).resolves(manifestGetResponse() as never);
    s3Mock.on(PutObjectCommand).resolves({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it("downloads manifest+parts, maps/validates rows, writes real Parquet, and uploads both files", async () => {
    const result = await buildIndexHandler({
      bucket: "crm-index-test",
      manifestCid: MANIFEST_CID,
      manifestKey: `manifests/${MANIFEST_CID}.json`,
      parts: [
        { path: "tables/county/property/part-00000.parquet" },
        { path: "tables/county/geometry/part-00000.parquet" },
      ],
      coverageParcelsPublished: 1,
      finishedAt: "2026-10-21T10:40:04.525Z",
      startedAt: "2026-10-21T10:30:00.000Z",
      fetchResults: [{ status: "ok" }, { status: "ok" }],
    } as never);

    expect(result.manifestCid).toBe(MANIFEST_CID);
    expect(result.bucket).toBe("crm-index-test");
    expect(result.propertyCount).toBe(1);
    expect(result.permitCount).toBe(1);
    expect(result.propertyKey).toBe(`index/${MANIFEST_CID}/crm_property.parquet`);
    expect(result.permitKey).toBe(`index/${MANIFEST_CID}/crm_permit.parquet`);
    expect(result.coverageParcelsPublished).toBe(1);
    expect(result.finishedAt).toBe("2026-10-21T10:40:04.525Z");
    expect(result.startedAt).toBe("2026-10-21T10:30:00.000Z");
    expect(result.anyPartUnverified).toBe(false);

    // Real Parquet bytes were actually written and uploaded (not just a mocked no-op): the
    // uploaded crm_property/crm_permit PutObject bodies carry the Parquet magic bytes "PAR1" at
    // both start and end of the file (the DuckDB COPY ... (FORMAT parquet) path, lines ~290-297).
    const puts = s3Mock.commandCalls(PutObjectCommand);
    expect(puts).toHaveLength(2);
    for (const call of puts) {
      const body = call.args[0].input.Body as Buffer;
      expect(body.subarray(0, 4).toString("latin1")).toBe("PAR1");
      expect(body.subarray(-4).toString("latin1")).toBe("PAR1");
    }
    const uploadedKeys = puts.map((call) => call.args[0].input.Key);
    expect(uploadedKeys).toContain(`index/${MANIFEST_CID}/crm_property.parquet`);
    expect(uploadedKeys).toContain(`index/${MANIFEST_CID}/crm_permit.parquet`);
  });

  it("marks anyPartUnverified true when any fetchResults entry is dlq'd", async () => {
    const result = await buildIndexHandler({
      bucket: "crm-index-test",
      manifestCid: MANIFEST_CID,
      manifestKey: `manifests/${MANIFEST_CID}.json`,
      parts: [{ path: "tables/county/property/part-00000.parquet" }],
      coverageParcelsPublished: 1,
      finishedAt: "2026-10-21T10:40:04.525Z",
      startedAt: "2026-10-21T10:30:00.000Z",
      fetchResults: [{ status: "dlq" }],
    } as never);

    expect(result.anyPartUnverified).toBe(true);
  });

  it("defaults anyPartUnverified to false when fetchResults is absent", async () => {
    const result = await buildIndexHandler({
      bucket: "crm-index-test",
      manifestCid: MANIFEST_CID,
      manifestKey: `manifests/${MANIFEST_CID}.json`,
      parts: [{ path: "tables/county/property/part-00000.parquet" }],
      coverageParcelsPublished: 1,
      finishedAt: "2026-10-21T10:40:04.525Z",
      startedAt: "2026-10-21T10:30:00.000Z",
    } as never);

    expect(result.anyPartUnverified).toBe(false);
  });
});

describe("BuildIndex: duckDbColumnsClause", () => {
  it("renders a DuckDB struct-literal columns clause from a column-name/type map", async () => {
    const { duckDbColumnsClause } = await import("../handlers/buildIndex.js");
    expect(duckDbColumnsClause({ a: "VARCHAR", b: "INTEGER" })).toBe(
      "{a: 'VARCHAR', b: 'INTEGER'}",
    );
  });

  it("renders a single-column clause without a trailing separator", async () => {
    const { duckDbColumnsClause } = await import("../handlers/buildIndex.js");
    expect(duckDbColumnsClause({ onlyCol: "DOUBLE" })).toBe("{onlyCol: 'DOUBLE'}");
  });
});
