// LeadIndex port, implemented over S3 Parquet via DuckDB (T026, INDEX group, espeon), per
// contracts/lead-index-port.md and ADR-01 (no OpenSearch domain — this is the only query surface
// in v1). Caches the opened DuckDB connection per-sandbox, per-manifest in module scope — not
// per-request — which is ADR-01's whole cost argument, so it must be visible in code, not just a
// comment (alakazam's consult).
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { openParquetConnection, type DuckDBConnection } from "../engine/duckdb.js";
import { METRIC_NAMES, type Observability } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

export class IndexNotReadyError extends Error {
  readonly code = "INDEX_NOT_READY" as const;
  constructor() {
    super("LeadIndex: no run has ever been promoted");
  }
}

export class IndexColdLoadTimeoutError extends Error {
  readonly code = "INDEX_COLD_LOAD_TIMEOUT" as const;
  constructor(manifestCid: string, timeoutMs: number) {
    super(`LeadIndex: cold load of manifest ${manifestCid} exceeded its ${timeoutMs}ms budget`);
  }
}

export interface IndexInfo {
  manifestCid: string;
  propertyCount: number;
  permitCount: number;
  promotedAt: string;
}

export interface BoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface SearchPropertiesQuery {
  bbox?: BoundingBox;
  roofAgeMinYears?: number;
  propertyUsageType?: string;
  limit?: number;
}

export interface SearchPermitsQuery {
  propertyCid?: string;
  isOpen?: boolean;
  openDaysMinimum?: number;
  sort?: "openDays" | "issueDate";
}

export type PropertyResult = Provenanced<CrmProperty>;
export type PermitResult = Provenanced<CrmPermit>;

export interface LeadIndex {
  indexInfo(): Promise<IndexInfo>;
  searchProperties(query: SearchPropertiesQuery): Promise<PropertyResult[]>;
  searchPermits(query: SearchPermitsQuery): Promise<PermitResult[]>;
  getProperty(propertyCid: string): Promise<(PropertyResult & { permits: PermitResult[] }) | null>;
}

interface BoundIndex {
  connection: DuckDBConnection;
}

/** Per-sandbox, per-manifest cache: one open DuckDB connection per manifestCid, reused across
 *  every request this Lambda sandbox serves — never re-downloaded or re-opened per request. This
 *  is ADR-01's entire cost argument, so it is a real module-level cache, not an in-request one. */
const sandboxCache = new Map<string, Promise<BoundIndex>>();

export interface DuckDbParquetDeps {
  ddb: DynamoDBDocumentClient;
  s3?: S3Client;
  tableName: string;
  bucket: string;
  obs: Observability;
  /** Default 3s per architecture-constitution.md §10's index-cold-load NFR. */
  coldLoadTimeoutMs?: number;
  tmpDir?: string;
}

const DEFAULT_COLD_LOAD_TIMEOUT_MS = 3_000;
const PK = "META#index";

export class DuckDbParquetLeadIndex implements LeadIndex {
  private readonly ddb: DynamoDBDocumentClient;
  private readonly s3: S3Client;
  private readonly tableName: string;
  private readonly bucket: string;
  private readonly obs: Observability;
  private readonly coldLoadTimeoutMs: number;
  private readonly tmpDir: string;

  constructor(deps: DuckDbParquetDeps) {
    this.ddb = deps.ddb;
    this.s3 = deps.s3 ?? new S3Client({});
    this.tableName = deps.tableName;
    this.bucket = deps.bucket;
    this.obs = deps.obs;
    this.coldLoadTimeoutMs = deps.coldLoadTimeoutMs ?? DEFAULT_COLD_LOAD_TIMEOUT_MS;
    this.tmpDir = deps.tmpDir ?? "/tmp/crm-index";
  }

  async indexInfo(): Promise<IndexInfo> {
    const item = await this.ddb.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: PK } }),
    );
    const current = item.Item?.current as string | undefined;
    // Never returns a run whose Validate step has not passed (constitution P0-3): the pointer
    // only ever names a Promoted run, so its mere presence is the readiness signal.
    if (current === undefined) throw new IndexNotReadyError();
    return {
      manifestCid: current,
      propertyCount: Number(item.Item?.propertyCount ?? 0),
      permitCount: Number(item.Item?.permitCount ?? 0),
      promotedAt: String(item.Item?.promotedAt ?? ""),
    };
  }

  /** Downloads and opens this manifest's Parquet once per sandbox, caching the open connection.
   *  A cache hit never re-downloads or re-emits IndexColdLoadMs — only a genuine cold load does. */
  private async ensureLoaded(manifestCid: string): Promise<BoundIndex> {
    const cached = sandboxCache.get(manifestCid);
    if (cached !== undefined) return cached;

    const loadPromise = this.coldLoad(manifestCid);
    sandboxCache.set(manifestCid, loadPromise);
    loadPromise.catch(() => sandboxCache.delete(manifestCid));
    return loadPromise;
  }

  private async coldLoad(manifestCid: string): Promise<BoundIndex> {
    const startedAt = Date.now();
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new IndexColdLoadTimeoutError(manifestCid, this.coldLoadTimeoutMs)),
        this.coldLoadTimeoutMs,
      );
    });

    const load = async (): Promise<BoundIndex> => {
      const dir = join(this.tmpDir, manifestCid);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const propertyFile = join(dir, "crm_property.parquet");
      const permitFile = join(dir, "crm_permit.parquet");
      await this.downloadToFile(`index/${manifestCid}/crm_property.parquet`, propertyFile);
      await this.downloadToFile(`index/${manifestCid}/crm_permit.parquet`, permitFile);

      const connection = await openParquetConnection(propertyFile, permitFile);
      return { connection };
    };

    try {
      const bound = await Promise.race([load(), timeout]);
      this.obs.metrics.addMetric(
        METRIC_NAMES.IndexColdLoadMs,
        MetricUnit.Milliseconds,
        Date.now() - startedAt,
      );
      return bound;
    } catch (error) {
      if (error instanceof IndexColdLoadTimeoutError) throw error;
      throw error;
    }
  }

  private async downloadToFile(key: string, destPath: string): Promise<void> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = res.Body;
    if (body === undefined) throw new Error(`LeadIndex: S3 object ${key} has no body`);
    await pipeline(body as NodeJS.ReadableStream, createWriteStream(destPath));
  }

  async searchProperties(query: SearchPropertiesQuery): Promise<PropertyResult[]> {
    const { manifestCid } = await this.indexInfo();
    const { connection } = await this.ensureLoaded(manifestCid);
    const conditions: string[] = [];
    if (query.bbox) {
      conditions.push(
        `latitude BETWEEN ${query.bbox.south} AND ${query.bbox.north} AND longitude BETWEEN ${query.bbox.west} AND ${query.bbox.east}`,
      );
    }
    if (query.roofAgeMinYears !== undefined)
      conditions.push(`"roofAgeYears" >= ${query.roofAgeMinYears}`);
    if (query.propertyUsageType !== undefined) {
      conditions.push(`"propertyUsageType" = '${query.propertyUsageType.replace(/'/g, "''")}'`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = query.limit ?? 100;
    const reader = await connection.runAndReadAll(
      `SELECT * FROM crm_property ${where} LIMIT ${limit}`,
    );
    return reader.getRowObjectsJS() as unknown as PropertyResult[];
  }

  async searchPermits(query: SearchPermitsQuery): Promise<PermitResult[]> {
    const { manifestCid } = await this.indexInfo();
    const { connection } = await this.ensureLoaded(manifestCid);
    const conditions: string[] = [];
    if (query.propertyCid !== undefined) conditions.push(`"propertyCid" = '${query.propertyCid}'`);
    // statusClass/isOpen are read verbatim from the vendored query-core derivation — never
    // recomputed here (contracts/lead-index-port.md): "isOpen" filters on the already-stored
    // statusClass column, it does not re-derive it from raw dates.
    if (query.isOpen !== undefined)
      conditions.push(`"statusClass" ${query.isOpen ? "=" : "<>"} 'open'`);
    if (query.openDaysMinimum !== undefined)
      conditions.push(`"openDays" >= ${query.openDaysMinimum}`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy =
      query.sort === "issueDate" ? `ORDER BY "issueDate"` : `ORDER BY "openDays" DESC`;
    const reader = await connection.runAndReadAll(`SELECT * FROM crm_permit ${where} ${orderBy}`);
    return reader.getRowObjectsJS() as unknown as PermitResult[];
  }

  async getProperty(
    propertyCid: string,
  ): Promise<(PropertyResult & { permits: PermitResult[] }) | null> {
    const { manifestCid } = await this.indexInfo();
    const { connection } = await this.ensureLoaded(manifestCid);
    const propertyReader = await connection.runAndReadAll(
      `SELECT * FROM crm_property WHERE "propertyCid" = '${propertyCid}'`,
    );
    const rows = propertyReader.getRowObjectsJS() as unknown as PropertyResult[];
    const property = rows[0];
    // null, not a thrown error, when the CID isn't in the currently promoted run (contracts/
    // lead-index-port.md) — later stories render this as a typed "not in this run" state.
    if (property === undefined) return null;

    const permitReader = await connection.runAndReadAll(
      `SELECT * FROM crm_permit WHERE "propertyCid" = '${propertyCid}'`,
    );
    const permits = permitReader.getRowObjectsJS() as unknown as PermitResult[];
    return { ...property, permits };
  }
}
