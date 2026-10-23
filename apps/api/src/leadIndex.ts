// Lazy singleton factory for the B-02 LeadIndex port, the same pattern as routers/auth.ts's
// `lockoutStore()`: built once per Lambda sandbox from env vars, not per request. The CDK env var
// names match apps/sync's own (infra/lib/crm-sync-stack.ts: CRM_INDEX_BUCKET_NAME,
// CRM_LEADS_TABLE_NAME) so the API Lambda reads the same bucket/table the sync job writes.
//
// Known gap (disclosed, not hidden): infra/lib/crm-api-stack.ts does not yet pass these two env
// vars, or an S3 read grant on the `crm-index` bucket / a DynamoDB read grant on the leads table,
// to the trpcHandler Lambda. Every unit test below injects its own DuckDbParquetLeadIndex
// directly and never calls this factory, so that gap has no effect on the Vitest suite — but it
// must be closed (a CDK change, out of this build group's T001-T018a scope) before search.* works
// on the hosted Lambda. Recorded here rather than silently assumed away.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createObservability } from "@crm/observability";
import { DuckDbParquetLeadIndex, type LeadIndex } from "./adapters/duckDbParquet.js";

let cached: LeadIndex | undefined;
let overridden = false;

/** Used by `createContext` (apps/api/src/handlers/health.ts): never throws, since the health
 *  route and any other route must still respond when the env vars aren't set yet (the known
 *  infra gap above) — `trpc.ts`'s `requireLeadIndex` is what turns a missing index into a typed
 *  tRPC error, at the one call site (`search`/`property`) that actually needs it. */
export function tryLeadIndex(): LeadIndex | undefined {
  if (overridden) return cached;
  if (cached === undefined) {
    const bucket = process.env.CRM_INDEX_BUCKET_NAME;
    const tableName = process.env.CRM_LEADS_TABLE_NAME;
    if (bucket === undefined || bucket === "" || tableName === undefined || tableName === "") {
      return undefined;
    }
    cached = new DuckDbParquetLeadIndex({
      ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
      tableName,
      bucket,
      obs: createObservability("crm-api"),
    });
  }
  return cached;
}

/** Test-only injection point: a test supplies a fake LeadIndex (or `undefined`, to simulate the
 *  not-wired-up state) instead of the real S3/DynamoDB-backed singleton above. */
export function setLeadIndexForTest(index: LeadIndex | undefined): void {
  cached = index;
  overridden = true;
}
