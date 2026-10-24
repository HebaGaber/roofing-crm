// Lazy singleton for the T018 rate-limiter/spend-cap pair, the same pattern as
// `leadService.ts`'s `tryLeadService`/`leadIndex.ts`'s `tryLeadIndex`: built once per Lambda
// sandbox from `CRM_AGENT_USAGE_TABLE_NAME` (infra/lib/crm-api-stack.ts), never per request.
// Never throws when the table isn't wired yet — `routers/agent.ts`'s budget check treats an
// absent guard as "not enforced this deploy" rather than failing every ask, matching the same
// "known infra gap, degrade not crash" rule `tryLeadIndex` documents for `search`/`property`.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createRateLimiter, type RateLimiter } from "./rateLimiter.js";
import { createSpendCap, type SpendCap } from "./spendCap.js";

export interface UsageGuard {
  readonly rateLimiter: RateLimiter;
  readonly spendCap: SpendCap;
}

let cached: UsageGuard | undefined;
let overridden = false;

export function tryUsageGuard(): UsageGuard | undefined {
  if (overridden) return cached;
  if (cached === undefined) {
    const tableName = process.env.CRM_AGENT_USAGE_TABLE_NAME;
    if (tableName === undefined || tableName === "") return undefined;
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    cached = {
      rateLimiter: createRateLimiter({ tableName, client }),
      spendCap: createSpendCap({ tableName, client }),
    };
  }
  return cached;
}

/** Test-only injection point, same shape as `setLeadIndexForTest`/`setLeadServiceForTest`. */
export function setUsageGuardForTest(guard: UsageGuard | undefined): void {
  cached = guard;
  overridden = true;
}
