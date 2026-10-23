// T037 (fixes G5 C-04): CrmSync's synthesized IAM policy document carries an explicit `Deny`
// statement for Task A's resource ARNs (architecture-constitution.md §7, constitution P0-1) on
// every role the stack creates — not just "at least one role," which the pre-existing assertion
// in crm-sync-stack.test.ts already covers. T038 fills infra/lib/crm-sync-stack.ts to make this
// pass — intentionally failing now (the stack is still B-01's empty stub).
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
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

interface IamPolicyResource {
  readonly Properties: {
    readonly Roles?: unknown[];
    readonly PolicyDocument?: { readonly Statement?: unknown[] };
  };
}

describe("CrmSync IAM Deny coverage (T037)", () => {
  it("every IAM::Role the stack creates has a Deny(DenyTaskAResources) policy attached", () => {
    const template = build();
    const roles = template.findResources("AWS::IAM::Role");
    const roleLogicalIds = Object.keys(roles);
    // Every NodejsFunction CDK creates its own default execution role — there should be exactly
    // five (Plan, FetchPart, BuildIndex, Validate, Promote), and none may be missing the Deny.
    expect(roleLogicalIds.length).toBeGreaterThanOrEqual(5);

    const policies = Object.values(
      template.findResources("AWS::IAM::Policy") as Record<string, IamPolicyResource>,
    );

    const roleLogicalIdHasDeny = new Map<string, boolean>(roleLogicalIds.map((id) => [id, false]));

    for (const policy of policies) {
      const statements = policy.Properties.PolicyDocument?.Statement ?? [];
      const hasDeny = statements.some(
        (statement) =>
          (statement as Record<string, unknown>).Effect === "Deny" &&
          (statement as Record<string, unknown>).Sid === "DenyTaskAResources",
      );
      if (!hasDeny) continue;
      for (const roleRef of policy.Properties.Roles ?? []) {
        // Each Roles entry is a { Ref: "<LogicalId>" } intrinsic.
        const ref = (roleRef as { Ref?: string } | undefined)?.Ref;
        if (ref !== undefined && roleLogicalIdHasDeny.has(ref)) {
          roleLogicalIdHasDeny.set(ref, true);
        }
      }
    }

    for (const [roleId, hasDeny] of roleLogicalIdHasDeny) {
      expect(hasDeny, `role ${roleId} is missing the DenyTaskAResources statement`).toBe(true);
    }
  });
});
