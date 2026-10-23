// T009: CrmSync now synthesizes the crm-sync Step Functions state machine (Plan → FetchPart(Map)
// → BuildIndex → Validate → Promote, architecture-constitution.md §2.3) and its Lambda handlers
// — no longer "intentionally empty" (B-01 T005). T038 (Phase 4, machamp) implements
// infra/lib/crm-sync-stack.ts to make this pass.
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { CrmSyncStack } from "../lib/crm-sync-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const PLAN_ENTRY = new URL("../../apps/sync/handlers/plan.ts", import.meta.url).pathname;
const FETCH_PART_ENTRY = new URL("../../apps/sync/handlers/fetchPart.ts", import.meta.url).pathname;
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
  // Built once (not per test): each build() call synths and Docker-bundles BuildIndex's and
  // Validate's native DuckDB binding, which is expensive enough that five fresh builds started
  // timing out individual tests once a second function needed the same treatment. The template
  // is immutable, so every assertion below reads the same one.
  let template: Template;

  beforeAll(() => {
    template = build();
  }, 240_000);

  it("creates the crm-sync Step Functions state machine", () => {
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      StateMachineName: "crm-sync",
    });
  });

  it("creates the five pipeline Lambdas (Plan, FetchPart, BuildIndex, Validate, Promote)", () => {
    template.resourceCountIs("AWS::Lambda::Function", 5);
  });

  it("denies Task A's resources on every role the stack creates (constitution P0-1)", () => {
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
    template.resourceCountIs("AWS::DynamoDB::Table", 0);
  });

  it("wires FetchPart's Distributed Map with concurrency 2-3 (ADR-02)", () => {
    const stateMachines = template.findResources("AWS::StepFunctions::StateMachine");
    const [first] = Object.values(stateMachines);
    const definition = JSON.stringify((first as Record<string, unknown>).Properties);
    // Found implementing T038: DefinitionString embeds the ASL JSON text as literal string
    // fragments inside an Fn::Join (needed because the Map/Task states reference dynamic Lambda
    // ARNs and the DLQ's queue URL) — JSON.stringify-ing that structure necessarily escapes the
    // ASL text's own embedded quote characters (`\"MaxConcurrency\":3`, not `"MaxConcurrency":3`).
    // Tolerating one optional backslash keeps this assertion meaningful without over-fitting to
    // a single CDK rendering strategy.
    expect(definition).toMatch(/\\?"MaxConcurrency\\?":[23]/);
  });
});
