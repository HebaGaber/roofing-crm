// createCrmStacks: the CDK app's stack graph (infra/bin/app.ts). Deploy order for this story
// (plan.md "Data Flow & Integration Points"): CrmOps → CrmApi → CrmWeb → CrmDomain. CrmData and
// CrmSync are declared as empty stubs (T005) so every story's CDK app has the same six-stack
// shape (architecture-constitution.md §9); they carry no dependency edges yet because they hold
// no resources this story depends on.
import { App, Aspects, Tags } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { CrmApiStack } from "../lib/crm-api-stack.js";
import { CrmDataStack } from "../lib/crm-data-stack.js";
import { CrmDomainStack } from "../lib/crm-domain-stack.js";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";
import { CrmSyncStack } from "../lib/crm-sync-stack.js";
import { CrmWebStack } from "../lib/crm-web-stack.js";
import type { CrmAppConfig } from "./config.js";

/** NodejsFunction bundles these directly from source (esbuild) — no separate build step. */
const HEALTH_HANDLER_ENTRY = "../../apps/api/src/handlers/health.ts";
const LOCKOUT_HANDLER_ENTRY = "../../apps/api/src/auth/lockout-handler.ts";
const PLAN_HANDLER_ENTRY = "../../apps/sync/handlers/plan.ts";
const FETCH_PART_HANDLER_ENTRY = "../../apps/sync/handlers/fetchPart.ts";
const BUILD_INDEX_HANDLER_ENTRY = "../../apps/sync/handlers/buildIndex.ts";
const VALIDATE_HANDLER_ENTRY = "../../apps/sync/handlers/validate.ts";
const PROMOTE_HANDLER_ENTRY = "../../apps/sync/handlers/promote.ts";
/** B-07 creates this table; CrmSync only ever references it by name for the META#index pointer
 * item (architecture-constitution.md §9 — no new table here, per infra/test/crm-sync-stack.test.ts's
 * own literal fixture value). */
const CRM_LEADS_TABLE_NAME = "crm-leads";

export function createCrmStacks(app: App, config: CrmAppConfig): void {
  const env = {
    region: config.region,
    ...(config.account === undefined ? {} : { account: config.account }),
  };

  const dataStack = new CrmDataStack(app, "CrmData", { env });
  const syncStack = new CrmSyncStack(app, "CrmSync", {
    env,
    planHandlerEntry: new URL(PLAN_HANDLER_ENTRY, import.meta.url).pathname,
    fetchPartHandlerEntry: new URL(FETCH_PART_HANDLER_ENTRY, import.meta.url).pathname,
    buildIndexHandlerEntry: new URL(BUILD_INDEX_HANDLER_ENTRY, import.meta.url).pathname,
    validateHandlerEntry: new URL(VALIDATE_HANDLER_ENTRY, import.meta.url).pathname,
    promoteHandlerEntry: new URL(PROMOTE_HANDLER_ENTRY, import.meta.url).pathname,
    indexBucketName: dataStack.indexBucket.bucketName,
    leadsTableName: CRM_LEADS_TABLE_NAME,
  });
  syncStack.addDependency(dataStack);

  const opsStack = new CrmOpsStack(app, "CrmOps", {
    env,
    lockoutHandlerEntry: new URL(LOCKOUT_HANDLER_ENTRY, import.meta.url).pathname,
  });

  const apiStack = new CrmApiStack(app, "CrmApi", {
    env,
    healthHandlerEntry: new URL(HEALTH_HANDLER_ENTRY, import.meta.url).pathname,
    userPool: opsStack.userPool,
    userPoolClient: opsStack.userPoolClient,
    lockoutTable: opsStack.lockoutTable,
  });
  // The recorded deviation from architecture-constitution.md §11's literal stack order
  // (plan.md's Complexity Tracking table): CrmApi's JWT authorizer needs CrmOps's pool first.
  apiStack.addDependency(opsStack);

  const webStack = new CrmWebStack(app, "CrmWeb", {
    env,
    githubRepository: config.githubRepository,
    githubRef: config.githubRef,
    apiUrl: apiStack.apiUrl,
    userPoolId: opsStack.userPool.userPoolId,
    userPoolClientId: opsStack.userPoolClient.userPoolClientId,
  });
  webStack.addDependency(apiStack);

  const domainStack = new CrmDomainStack(app, "CrmDomain", {
    env,
    domainName: "crm.aldarraj.com",
    cutover: false, // Round 1 decision D-2: not pointed live until after this story merges.
    web: { appId: webStack.app.attrAppId, branchName: webStack.branch.branchName },
  });
  domainStack.addDependency(webStack);

  for (const stack of [dataStack, syncStack, opsStack, apiStack, webStack, domainStack]) {
    // constitution Article III: every resource tagged project_name=roofing-crm (TN01).
    Tags.of(stack).add("project_name", "roofing-crm");
  }

  // TN02: cdk-nag on every stack, enumerated explicitly.
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}
