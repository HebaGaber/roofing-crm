// T020 (B-09, US4/AC-7): proves the deployed LeadIndex reads from Task A's Run 1 full-county
// manifest (bafkreiddef7...h6gu, 441,961 properties / 17,387 permits), not the earlier 35-row
// sample. This is an AWS-backed check, not a fake-injected unit test — `leadIndex.ts`'s own
// comment notes every *other* test in this file tree injects a fake LeadIndex and never depends
// on CRM_INDEX_BUCKET_NAME/CRM_LEADS_TABLE_NAME being set; this is the one test that deliberately
// does, the same way tests/agent/golden.test.ts deliberately requires RUNTIME_URL instead of
// faking the agent. It is a local no-op (skipped, not failed) until the real stack is deployed
// and its env vars are present — see specs/009-agent-hardening/run-log.md's recorded note that
// the actual data switch (promoting the Run 1 manifest) is an operational action, not a code
// change, and stays open pending the user's go-ahead.
import { describe, expect, it } from "vitest";
import { setLeadIndexForTest, tryLeadIndex } from "../src/leadIndex.js";

const RUN_1_MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";

const hasDeployedIndexEnv =
  process.env.CRM_INDEX_BUCKET_NAME !== undefined &&
  process.env.CRM_INDEX_BUCKET_NAME !== "" &&
  process.env.CRM_LEADS_TABLE_NAME !== undefined &&
  process.env.CRM_LEADS_TABLE_NAME !== "";

describe.skipIf(!hasDeployedIndexEnv)(
  "LeadIndex reads the Run 1 full-county manifest (deployed only)",
  () => {
    it("indexInfo().manifestCid equals the pinned Run 1 CID, not the 35-row sample", async () => {
      setLeadIndexForTest(undefined); // force tryLeadIndex() to build a real adapter from env
      const leadIndex = tryLeadIndex();
      expect(leadIndex).toBeDefined();
      const info = await leadIndex!.indexInfo();
      expect(info.manifestCid).toBe(RUN_1_MANIFEST_CID);
    });
  },
);

describe.skipIf(hasDeployedIndexEnv)(
  "LeadIndex reads the Run 1 full-county manifest (local run, no deployed env)",
  () => {
    it.todo(
      "skipped locally — set CRM_INDEX_BUCKET_NAME/CRM_LEADS_TABLE_NAME to the deployed stack's " +
        "values to run this for real (Phase Z/TZ05), once the Run 1 manifest is actually promoted",
    );
  },
);
