// T051 (B-09, Phase 6/US3, AC-6/contracts/observability.md): `CrmOpsStack` must create a
// `cloudwatch.Dashboard` named `RoofingCrm` (porygon's design: no dashboard CDK exists yet; this
// is the one stack that already owns cross-cutting operational concerns, per agent-design.md
// porygon §3). T053 adds it; this test only asserts the dashboard resource and its name exist —
// the per-widget shape isn't independently assertable via CDK-assertions (DashboardBody is a
// single opaque JSON blob), so widget coverage is reviewed by reading crm-ops-stack.ts directly,
// per contracts/observability.md's widget list.
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const LOCKOUT_ENTRY = new URL("../../apps/api/src/auth/lockout-handler.ts", import.meta.url)
  .pathname;

function build(): Template {
  const app = new App();
  // T053 threads the sync stack's DLQ/alarm references into CrmOpsStack's props as *optional*
  // fields (same cross-stack-reference pattern as dataStack.agentUsageTable -> CrmApiStack in
  // infra/src/app.ts) — this test omits them to check the dashboard resource itself exists even
  // without them; the real app wiring (infra/src/app.ts) supplies them so the DLQ-depth/alarm-
  // status widgets render for real.
  const stack = new CrmOpsStack(app, "CrmOps", {
    env: ENV,
    lockoutHandlerEntry: LOCKOUT_ENTRY,
  });
  return Template.fromStack(stack);
}

describe("CrmOpsStack dashboard (T051/T053)", () => {
  it("creates a CloudWatch dashboard named RoofingCrm", () => {
    const template = build();
    template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
      DashboardName: "RoofingCrm",
    });
  });
});
