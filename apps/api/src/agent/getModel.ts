// T033 (B-09, Phase 4/US1): the `AI_PROVIDER` switch (ADR-06 §6.1, docs/decisions/
// 0000-agent-architecture.md: "Selected by AI_PROVIDER... Model ids come from config and never
// appear in agent code."). The switch's two branch names (`bedrock`/`gateway`) are the only
// literals this module hard-codes; the model id itself always comes from `AGENT_MODEL_ID` (never
// a fallback default — same fail-fast rule as `@crm/config`'s `loadConfig`), so a misconfigured
// deploy throws at the first `agent.ask` rather than silently calling some other model.
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { gateway, type LanguageModel } from "ai";

export type AiProviderEnv = Record<string, string | undefined>;

export class UnsupportedAiProviderError extends Error {
  constructor(readonly provider: string | undefined) {
    super(`getModel: unsupported AI_PROVIDER "${String(provider)}" — expected "bedrock" or "gateway".`);
  }
}

export class MissingAgentModelIdError extends Error {
  constructor() {
    super("getModel: AGENT_MODEL_ID is not set — refusing to default to any model.");
  }
}

// Lazy singleton per provider+modelId combination — the same per-Lambda-sandbox caching pattern
// as `usageGuard.ts`'s `tryUsageGuard`/`leadIndex.ts`'s `tryLeadIndex`, built once rather than on
// every `agent.ask` — but keyed on the inputs (not a single unconditional cache) since a test may
// call `getModel` with different `env` values in the same process.
const cache = new Map<string, LanguageModel>();

/** Reads `AI_PROVIDER` (`"bedrock" | "gateway"`) and `AGENT_MODEL_ID` from `env` (defaults to
 *  `process.env`, injectable for tests) and returns the corresponding Vercel AI SDK
 *  `LanguageModel` — `@ai-sdk/amazon-bedrock`'s provider for `bedrock` (ADR §6.1: `eu.` inference
 *  profile ids, read from config, e.g. `eu.anthropic.claude-sonnet-4-6`), or the AI SDK's own
 *  `gateway` provider for `gateway` (e.g. `anthropic/claude-sonnet-4.6`). Any other value throws
 *  `UnsupportedAiProviderError`, never a silent fallback (constitution VI).
 */
export function getModel(env: AiProviderEnv = process.env): LanguageModel {
  const modelId = env.AGENT_MODEL_ID;
  if (modelId === undefined || modelId === "") {
    throw new MissingAgentModelIdError();
  }
  const provider = env.AI_PROVIDER;
  const key = `${String(provider)}:${modelId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let model: LanguageModel;
  switch (provider) {
    case "bedrock": {
      const bedrock = createAmazonBedrock({});
      model = bedrock(modelId);
      break;
    }
    case "gateway":
      model = gateway(modelId);
      break;
    default:
      throw new UnsupportedAiProviderError(provider);
  }
  cache.set(key, model);
  return model;
}

/** Test-only reset point, same shape as `setLeadIndexForTest`/`setUsageGuardForTest`: clears the
 *  per-provider+modelId cache so a test that varies `AI_PROVIDER`/`AGENT_MODEL_ID` doesn't read
 *  back a previous test's cached model instance. */
export function resetModelCacheForTest(): void {
  cache.clear();
}
