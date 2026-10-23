// LeadIndex port, implemented over S3 Parquet via DuckDB (T026, INDEX group, espeon), per
// contracts/lead-index-port.md and ADR-01 (no OpenSearch domain — this is the only query surface
// in v1). Caches the opened DuckDB connection per-sandbox, per-manifest in module scope — not
// per-request — which is ADR-01's whole cost argument, so it must be visible in code, not just a
// comment (alakazam's consult).
import { S3Client } from "@aws-sdk/client-s3";
import { GetCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openParquetConnection, type DuckDBConnection } from "../engine/duckdb.js";
import {
  downloadS3ObjectToFile,
  METRIC_NAMES,
  withObservabilityOperation,
  type Observability,
} from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

/** DuckDB's own single-quote escaping (double the quote) — the one rule every string literal
 *  interpolated into a SQL string in this adapter must follow consistently (CR-B-02 finding #4:
 *  `propertyUsageType` already did this; `propertyCid` did not). */
function sqlEscapeString(value: string): string {
  return value.replace(/'/g, "''");
}

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

/** CR-B-02 finding #8: thrown internally by a cold-load attempt that finishes after a newer
 *  attempt for the same manifestCid has already started (this one lost the race to the timeout).
 *  Never surfaces to a caller of `searchProperties`/`searchPermits`/`getProperty` — it is only
 *  ever observed by `coldLoad`'s own background-rejection handling, exported solely so a test can
 *  assert on it directly rather than only on its side effects. */
export class IndexColdLoadStaleAttemptError extends Error {
  readonly code = "INDEX_COLD_LOAD_STALE_ATTEMPT" as const;
  constructor(manifestCid: string, attemptId: number) {
    super(
      `LeadIndex: cold-load attempt ${attemptId} for manifest ${manifestCid} was superseded by a newer attempt; discarded`,
    );
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
  /** CR-B-02 finding #8: one monotonically increasing attempt id per manifestCid. A timed-out
   *  `coldLoad` never cancels the in-flight `load()` it raced against (Promise.race doesn't
   *  cancel its loser) — without this, that abandoned load could still be mid-write to the same
   *  on-disk path a later retry for the same manifestCid also uses, corrupting it. Each attempt
   *  gets its own directory keyed by this counter, and an attempt that resolves after a newer one
   *  has already started is recognized as stale and discarded instead of being returned or left
   *  to linger. */
  private readonly loadAttemptCounter = new Map<string, number>();

  constructor(deps: DuckDbParquetDeps) {
    this.ddb = deps.ddb;
    this.s3 = deps.s3 ?? new S3Client({});
    this.tableName = deps.tableName;
    this.bucket = deps.bucket;
    this.obs = deps.obs;
    this.coldLoadTimeoutMs = deps.coldLoadTimeoutMs ?? DEFAULT_COLD_LOAD_TIMEOUT_MS;
    this.tmpDir = deps.tmpDir ?? "/tmp/crm-index";
  }

  // T048 (Phase 6 convergence, CRITICAL): every public LeadIndex method is wrapped with the
  // shared Powertools observability middleware (constitution Article VIII), reusing
  // `withObservabilityOperation` from `packages/observability` rather than hand-rolling
  // Logger/Tracer/Metrics calls here. This port is not itself a Lambda handler entry point (its
  // caller constructs one `Observability` per invocation and injects it via `deps.obs`), so it
  // uses the instrument-in-place form rather than `withObservability` (which always constructs
  // its own fresh Observability — correct for a handler, wrong for a reused, caller-owned one).
  async indexInfo(): Promise<IndexInfo> {
    return withObservabilityOperation(this.obs, "LeadIndex.indexInfo", async () => {
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
    });
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
    // This attempt's own generation number. A later ensureLoaded() call for the same manifestCid
    // (e.g. a retry after this attempt times out) bumps the counter again, so this value is only
    // ever "current" until a newer attempt starts.
    const attemptId = (this.loadAttemptCounter.get(manifestCid) ?? 0) + 1;
    this.loadAttemptCounter.set(manifestCid, attemptId);

    const startedAt = Date.now();
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new IndexColdLoadTimeoutError(manifestCid, this.coldLoadTimeoutMs)),
        this.coldLoadTimeoutMs,
      );
    });

    // Keyed by attemptId, not just manifestCid: an abandoned load (the Promise.race loser) keeps
    // running after the timeout rejects, so its writes must never land in the same directory a
    // later, newer attempt for this manifestCid also writes to.
    const dir = join(this.tmpDir, manifestCid, String(attemptId));

    const load = async (): Promise<BoundIndex> => {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const propertyFile = join(dir, "crm_property.parquet");
      const permitFile = join(dir, "crm_permit.parquet");
      await this.downloadToFile(`index/${manifestCid}/crm_property.parquet`, propertyFile);
      await this.downloadToFile(`index/${manifestCid}/crm_permit.parquet`, permitFile);

      const connection = await openParquetConnection(propertyFile, permitFile);

      // This attempt lost the race to the timeout (a newer attemptId was already recorded while
      // this load() was still in flight) — never return or cache a stale connection; close it and
      // clean up its own (uniquely keyed) directory instead.
      if (this.loadAttemptCounter.get(manifestCid) !== attemptId) {
        connection.closeSync();
        rmSync(dir, { recursive: true, force: true });
        throw new IndexColdLoadStaleAttemptError(manifestCid, attemptId);
      }
      return { connection };
    };

    const loadPromise = load();
    // Prevents an unhandled-rejection warning/crash: when `timeout` wins the race below, nothing
    // else is awaiting `loadPromise` directly any more, but it keeps running and will eventually
    // settle on its own (successfully, as a stale attempt it self-discards, or with a real
    // error). Promise.race still observes this same promise's original settlement for its own
    // purposes; this just stops the abandoned branch from going unhandled.
    loadPromise.catch(() => undefined);

    const bound = await Promise.race([loadPromise, timeout]);
    this.obs.metrics.addMetric(
      METRIC_NAMES.IndexColdLoadMs,
      MetricUnit.Milliseconds,
      Date.now() - startedAt,
    );
    return bound;
  }

  private async downloadToFile(key: string, destPath: string): Promise<void> {
    await downloadS3ObjectToFile(this.s3, this.bucket, key, destPath);
  }

  async searchProperties(query: SearchPropertiesQuery): Promise<PropertyResult[]> {
    return withObservabilityOperation(this.obs, "LeadIndex.searchProperties", async () => {
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
        conditions.push(`"propertyUsageType" = '${sqlEscapeString(query.propertyUsageType)}'`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = query.limit ?? 100;
      const reader = await connection.runAndReadAll(
        `SELECT * FROM crm_property ${where} LIMIT ${limit}`,
      );
      return reader.getRowObjectsJS() as unknown as PropertyResult[];
    });
  }

  async searchPermits(query: SearchPermitsQuery): Promise<PermitResult[]> {
    return withObservabilityOperation(this.obs, "LeadIndex.searchPermits", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const conditions: string[] = [];
      if (query.propertyCid !== undefined)
        conditions.push(`"propertyCid" = '${sqlEscapeString(query.propertyCid)}'`);
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
    });
  }

  async getProperty(
    propertyCid: string,
  ): Promise<(PropertyResult & { permits: PermitResult[] }) | null> {
    return withObservabilityOperation(this.obs, "LeadIndex.getProperty", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const propertyReader = await connection.runAndReadAll(
        `SELECT * FROM crm_property WHERE "propertyCid" = '${sqlEscapeString(propertyCid)}'`,
      );
      const rows = propertyReader.getRowObjectsJS() as unknown as PropertyResult[];
      const property = rows[0];
      // null, not a thrown error, when the CID isn't in the currently promoted run (contracts/
      // lead-index-port.md) — later stories render this as a typed "not in this run" state.
      if (property === undefined) return null;

      const permitReader = await connection.runAndReadAll(
        `SELECT * FROM crm_permit WHERE "propertyCid" = '${sqlEscapeString(propertyCid)}'`,
      );
      const permits = permitReader.getRowObjectsJS() as unknown as PermitResult[];
      return { ...property, permits };
    });
  }
}
