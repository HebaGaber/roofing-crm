// infra/bin/app.ts's loadConfig: region from @crm/config (fails fast on a disallowed region,
// CLAUDE.md "region-locked to eu-north-1"), plus the cdk.json context values the CDK app needs
// (crm:githubRepository, crm:githubRef, crm:allowedRegions — see infra/cdk.json).
import { loadConfig as loadRuntimeConfig, type RuntimeConfig } from "@crm/config";

export interface CrmAppConfig extends RuntimeConfig {
  readonly githubRepository: string;
  readonly githubRef: string;
  readonly additionalBranches: readonly string[];
  readonly account?: string;
}

export type ContextGetter = (key: string) => unknown;

export type LoadConfigEnv = Record<string, string | undefined>;

export function loadConfig(env: LoadConfigEnv, getContext: ContextGetter): CrmAppConfig {
  const runtime = loadRuntimeConfig(env);
  const githubRepository = getContext("crm:githubRepository");
  const githubRef = getContext("crm:githubRef");
  if (typeof githubRepository !== "string" || githubRepository === "") {
    throw new Error("cdk.json context crm:githubRepository is required");
  }
  if (typeof githubRef !== "string" || githubRef === "") {
    throw new Error("cdk.json context crm:githubRef is required");
  }
  const additionalBranchesRaw = getContext("crm:additionalBranches");
  const additionalBranches = Array.isArray(additionalBranchesRaw)
    ? additionalBranchesRaw.filter((b): b is string => typeof b === "string")
    : [];
  return {
    ...runtime,
    githubRepository,
    githubRef,
    additionalBranches,
    ...(env.CDK_DEFAULT_ACCOUNT === undefined ? {} : { account: env.CDK_DEFAULT_ACCOUNT }),
  };
}
