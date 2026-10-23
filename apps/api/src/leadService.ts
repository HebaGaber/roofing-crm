// Lazy singleton for the B-07 lead service, the same pattern as leadIndex.ts's `tryLeadIndex`:
// built once per Lambda sandbox from env vars (CRM_LEADS_TABLE_NAME, region from the Lambda's own
// AWS_REGION via the SDK default chain, never hard-coded). This is the one place the concrete
// DynamoDB `LeadRepo` is instantiated and injected into `createLeadService`.
import { createDynamoLeadRepoFromEnv } from "./adapters/leadRepo.js";
import { createLeadService, type LeadService } from "./services/leads.js";
import { tryLeadIndex } from "./leadIndex.js";

let cached: LeadService | undefined;
let overridden = false;

/** Never throws: a missing table name must not break health/auth routes; `requireLeadService`
 *  turns the absence into a typed error at the procedures that need it. */
export function tryLeadService(): LeadService | undefined {
  if (overridden) return cached;
  if (cached === undefined) {
    const table = process.env.CRM_LEADS_TABLE_NAME;
    if (table === undefined || table === "") return undefined;
    const leadIndex = tryLeadIndex();
    cached = createLeadService(createDynamoLeadRepoFromEnv(), leadIndex ? { leadIndex } : {});
  }
  return cached;
}

export function setLeadServiceForTest(service: LeadService | undefined): void {
  cached = service;
  overridden = true;
}
