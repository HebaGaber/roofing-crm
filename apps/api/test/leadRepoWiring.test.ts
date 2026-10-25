// Regression: the agent's "already a lead" check and lead proposals need the same DynamoDB
// LeadRepo the lead service uses; the deployed Lambda context once left it out (G7 failed live).
import { afterEach, describe, expect, it } from "vitest";
import { tryLeadRepo } from "../src/leadService.js";

describe("tryLeadRepo", () => {
  const saved = process.env.CRM_LEADS_TABLE_NAME;
  afterEach(() => {
    if (saved === undefined) delete process.env.CRM_LEADS_TABLE_NAME;
    else process.env.CRM_LEADS_TABLE_NAME = saved;
  });

  it("is undefined without a table name and never throws", () => {
    delete process.env.CRM_LEADS_TABLE_NAME;
    expect(tryLeadRepo()).toBeUndefined();
  });

  it("returns one shared repo once the table name is set", () => {
    process.env.CRM_LEADS_TABLE_NAME = "crm-leads";
    const first = tryLeadRepo();
    expect(first).toBeDefined();
    expect(tryLeadRepo()).toBe(first);
  });
});
