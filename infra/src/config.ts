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

/** Constitution VI: Bedrock is the default and Golden Path (ADR-06 §6.1) — a safe, documented
 *  default, unlike `DATA_MANIFEST_CID`, which has none and must fail fast. `@crm/config`'s
 *  `loadConfig` itself no longer defaults `AI_PROVIDER`/`AGENT_MODEL_ID` (it fails fast like every
 *  other field); this composition layer is where the actual default selection lives, since it
 *  has `process.env` in scope before `loadRuntimeConfig` validates it. */
function withAiProviderDefaults(env: LoadConfigEnv): LoadConfigEnv {
  const aiProvider = env.AI_PROVIDER ?? "bedrock";
  const agentModelId =
    env.AGENT_MODEL_ID ??
    (aiProvider === "bedrock" ? "eu.anthropic.claude-sonnet-4-6" : "anthropic/claude-sonnet-4.6");
  return { ...env, AI_PROVIDER: aiProvider, AGENT_MODEL_ID: agentModelId };
}

export function loadConfig(env: LoadConfigEnv, getContext: ContextGetter): CrmAppConfig {
  const runtime = loadRuntimeConfig(withAiProviderDefaults(env));
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
