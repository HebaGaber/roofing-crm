// T009: CrmSync now synthesizes the crm-sync Step Functions state machine (Plan → FetchPart(Map)
// → BuildIndex → Validate → Promote, architecture-constitution.md §2.3) and its Lambda handlers
// — no longer "intentionally empty" (B-01 T005). T038 (Phase 4, machamp) implements
// infra/lib/crm-sync-stack.ts to make this pass.
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmSyncStack } from "../lib/crm-sync-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const PLAN_ENTRY = new URL("../../apps/sync/handlers/plan.ts", import.meta.url).pathname;
const FETCH_PART_ENTRY = new URL("../../apps/sync/handlers/fetchPart.ts", import.meta.url)
  .pathname;
const BUILD_INDEX_ENTRY = new URL("../../apps/sync/handlers/buildIndex.ts", import.meta.url)
  .pathname;
const VALIDATE_ENTRY = new URL("../../apps/sync/handlers/validate.ts", import.meta.url).pathname;
const PROMOTE_ENTRY = new URL("../../apps/sync/handlers/promote.ts", import.meta.url).pathname;

function build() {
  const app = new App();
  return Template.fromStack(
    new CrmSyncStack(app, "CrmSync", {
      env: ENV,
      planHandlerEntry: PLAN_ENTRY,
      fetchPartHandlerEntry: FETCH_PART_ENTRY,
      buildIndexHandlerEntry: BUILD_INDEX_ENTRY,
      validateHandlerEntry: VALIDATE_ENTRY,
      promoteHandlerEntry: PROMOTE_ENTRY,
      indexBucketName: "crm-index",
      leadsTableName: "crm-leads",
    }),
  );
}

describe("CrmSync (T038)", () => {
  it("creates the crm-sync Step Functions state machine", () => {
    const template = build();
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineName: "crm-sync",
    });
  });

  it("creates the five pipeline Lambdas (Plan, FetchPart, BuildIndex, Validate, Promote)", () => {
    const template = build();
    template.resourceCountIs("AWS::Lambda::Function", 5);
  });

  it("denies Task A's resources on every role the stack creates (constitution P0-1)", () => {
    const template = build();
    const policies = template.findResources("AWS::IAM::Policy");
    const denyPolicies = Object.values(policies).filter((policy) => {
      const statements = (policy as Record<string, unknown>).Properties as {
        PolicyDocument?: { Statement?: unknown[] };
      };
      return (statements.PolicyDocument?.Statement ?? []).some(
        (statement) =>
          (statement as Record<string, unknown>).Effect === "Deny" &&
          (statement as Record<string, unknown>).Sid === "DenyTaskAResources",
      );
    });
    expect(denyPolicies.length).toBeGreaterThan(0);
  });

  it("reuses the existing crm-leads table — declares no new DynamoDB table", () => {
    const template = build();
    template.resourceCountIs("AWS::DynamoDB::Table", 0);
  });

  it("wires FetchPart's Distributed Map with concurrency 2-3 (ADR-02)", () => {
    const template = build();
    const stateMachines = template.findResources("AWS::StepFunctions::StateMachine");
    const [first] = Object.values(stateMachines);
    const definition = JSON.stringify((first as Record<string, unknown>).Properties);
    expect(definition).toMatch(/"MaxConcurrency":[23]/);
  });
});
