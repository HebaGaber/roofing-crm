// T033 (B-09, Phase 4/US1): the `AI_PROVIDER` switch (ADR-06 §6.1, docs/decisions/
// 0000-agent-architecture.md: "Selected by AI_PROVIDER... Model ids come from config and never
// appear in agent code."). The switch's two branch names (`bedrock`/`gateway`) are the only
// literals this module hard-codes; the model id itself always comes from `AGENT_MODEL_ID` (never
// a fallback default — same fail-fast rule as `@crm/config`'s `loadConfig`), so a misconfigured
// deploy throws at the first `agent.ask` rather than silently calling some other model.
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGateway, type LanguageModel } from "ai";

export type AiProviderEnv = Record<string, string | undefined>;

export class UnsupportedAiProviderError extends Error {
  constructor(readonly provider: string | undefined) {
    super(
      `getModel: unsupported AI_PROVIDER "${String(provider)}" — expected "bedrock" or "gateway".`,
    );
  }
}

export class MissingAgentModelIdError extends Error {
  constructor() {
    super("getModel: AGENT_MODEL_ID is not set — refusing to default to any model.");
  }
}

/** CR finding 2: the gateway provider reads `AI_GATEWAY_API_KEY`. In the deployed Lambda that key
 *  must come from Secrets Manager (never an env literal in CDK), and that wiring does not exist —
 *  infra/lib/crm-api-stack.ts refuses to synth `AI_PROVIDER=gateway` for the same reason. Locally
 *  (`~/.config/assessment/ai-gateway.env` sourced into the shell) the key is present and this
 *  path works; anywhere it isn't, fail typed here rather than with a provider auth error at the
 *  first model call. */
export class GatewayKeyNotWiredError extends Error {
  constructor() {
    super(
      "getModel: AI_PROVIDER=gateway but no AI Gateway key is available (it must be loaded from Secrets Manager; not wired in this deployment).",
    );
    this.name = "GatewayKeyNotWiredError";
  }
}

// Lazy singleton per provider+modelId combination — the same per-Lambda-sandbox caching pattern
// as `usageGuard.ts`'s `requireUsageGuard`/`leadIndex.ts`'s `tryLeadIndex`, built once rather than on
// every `agent.ask` — but keyed on the inputs (not a single unconditional cache) since a test may
// call `getModel` with different `env` values in the same process.
const cache = new Map<string, Exclude<LanguageModel, string>>();

/** Reads `AI_PROVIDER` (`"bedrock" | "gateway"`) and `AGENT_MODEL_ID` from `env` (defaults to
 *  `process.env`, injectable for tests) and returns the corresponding Vercel AI SDK
 *  `LanguageModel` — `@ai-sdk/amazon-bedrock`'s provider for `bedrock` (ADR §6.1: `eu.` inference
 *  profile ids, read from config, e.g. `eu.anthropic.claude-sonnet-4-6`), or the AI SDK's own
 *  `gateway` provider for `gateway` (e.g. `anthropic/claude-sonnet-4.6`). Any other value throws
 *  `UnsupportedAiProviderError`, never a silent fallback (constitution VI).
 */
export function getModel(env: AiProviderEnv = process.env): Exclude<LanguageModel, string> {
  const modelId = env.AGENT_MODEL_ID;
  if (modelId === undefined || modelId === "") {
    throw new MissingAgentModelIdError();
  }
  const provider = env.AI_PROVIDER;
  const key = `${String(provider)}:${modelId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let model: Exclude<LanguageModel, string>;
  switch (provider) {
    case "bedrock": {
      const bedrock = createAmazonBedrock({});
      model = bedrock(modelId);
      break;
    }
    case "gateway": {
      const apiKey = env.AI_GATEWAY_API_KEY;
      if (apiKey === undefined || apiKey === "") throw new GatewayKeyNotWiredError();
      model = createGateway({ apiKey })(modelId);
      break;
    }
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
