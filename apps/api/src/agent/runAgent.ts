// T034 (B-09, Phase 4/US1): the tool loop via the AI SDK's own `generateText` (ADR-06 §6.1: "the
// AI SDK's own tool-loop, not hand-rolled"), one 23s `AbortController`/`setTimeout` around the
// whole call, with `AbortError` mapped to a typed `{outcome: "timed_out"}` result — never
// rethrown as an unhandled 500, the same pattern as `mapIndexNotReady` in
// apps/api/src/routers/search.ts.
//
// Deviation from the task's literal `generateText({model, tools, maxSteps: 3, abortSignal})`
// phrasing, noted in the builder's report: the installed `ai@7.0.152` has no `maxSteps` option on
// `generateText` — that name belongs to an older AI SDK major. This version's own multi-step
// tool-loop control is `stopWhen: stepCountIs(n)` (exported from `ai`), which this module uses to
// get the identical "at most 3 model calls this turn" budget (ADR §6.1) the task intends.
import {
  generateText,
  stepCountIs,
  type GenerateTextResult,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";

// T045 (B-09, Phase 5/US2): Bedrock prompt caching (ADR-06 §6.1: "Wrap the Bedrock model (cache
// points on the system prompt and the last non-system message). Log cache read/write tokens. Put
// `cacheStrategy` in the trace metadata."). `@ai-sdk/amazon-bedrock`'s Converse mapping reads a
// cache point off `providerOptions.bedrock.cachePoint` (or the `amazonBedrock` alias) on a
// message, not off a model-level setting — see
// `@ai-sdk/amazon-bedrock/dist/index.js`'s `getCachePoint`/`pushCachePoint`, which checks
// `message.providerOptions` for the system block and for each user/assistant/tool message. There
// is no "wrap the model" API; the cache points are prompt-shaped, so this module builds the
// `system`/`prompt` as cache-annotated messages only on the Bedrock path (`generateText`'s
// `system` field accepts a `SystemModelMessage`, not only a plain string — see `ai`'s
// `Instructions = string | SystemModelMessage | Array<SystemModelMessage>`). The Gateway path
// (`getModel.ts`'s other branch) has no equivalent control and keeps the original plain
// `system`/`prompt` strings untouched.
const BEDROCK_CACHE_POINT_PROVIDER_OPTIONS = { bedrock: { cachePoint: { type: "default" } } };

/** Trace-metadata label for `AgentAnswer.trace.cacheStrategy` (ADR §6.1) — `"none"` when the
 *  model isn't Bedrock (the Gateway path has no cache-point control to report). */
export type CacheStrategy = "bedrock:system+last-message" | "none";

/** `@ai-sdk/amazon-bedrock`'s language model sets `provider: "amazon-bedrock"` (see
 *  `createAmazonBedrock(...)`'s model classes) — the one place this module can detect "we are on
 *  the Bedrock path" without threading `AI_PROVIDER` through `RunAgentInput` as a second signal
 *  that could drift from the model actually passed in. */
function isBedrockModel(model: LanguageModel): boolean {
  return typeof model !== "string" && model.provider === "amazon-bedrock";
}

/** ADR-06 §6.1 / contracts/agent-api.md step 9: the server aborts at 23s, inside the Lambda's own
 *  28s timeout and the HTTP API's 29-30s limit (nested on purpose, Task A AD-27-style layering). */
export const RUN_AGENT_TIMEOUT_MS = 23_000;

/** ADR-06 §6.1: "At most 3 model calls" this turn — the AI SDK's own loop stops issuing further
 *  `doGenerate` calls once this many steps have run, whatever the model/tools still want to do. */
export const RUN_AGENT_MAX_STEPS = 3;

export interface RunAgentInput<TOOLS extends ToolSet> {
  readonly model: LanguageModel;
  readonly tools: TOOLS;
  readonly system: string;
  readonly prompt: string;
}

type GenerateTextReturn<TOOLS extends ToolSet> = Awaited<ReturnType<typeof generateText<TOOLS>>>;

export type RunAgentResult<TOOLS extends ToolSet> =
  | {
      readonly outcome: "ok";
      readonly result: GenerateTextReturn<TOOLS>;
      /** ADR §6.1's trace-metadata requirement — which cache strategy (if any) this turn's
       *  `generateText` call used, for `AgentAnswer.trace.cacheStrategy`. */
      readonly cacheStrategy: CacheStrategy;
    }
  | { readonly outcome: "timed_out" };

/** True for the AI SDK's own `AbortError` (thrown by `generateText` when `abortSignal` fires)
 *  and, defensively, for any error surfacing after the controller has already aborted — the same
 *  defensive-OR `mapIndexNotReady`-style typed-error mapping used elsewhere in this router layer. */
function isAbortError(error: unknown, controller: AbortController): boolean {
  if (controller.signal.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

/** Runs one `agent.ask` turn's tool loop. Never throws on a timeout — callers get a typed
 *  `{outcome: "timed_out"}` instead, exactly like `IndexNotReadyError`'s mapping in
 *  `routers/search.ts`. Any other failure (a genuine model/tool error) is rethrown, since that is
 *  not a timeout and the caller's own error mapping (TRPCError) is the right place for it. */
export async function runAgent<TOOLS extends ToolSet>(
  input: RunAgentInput<TOOLS>,
): Promise<RunAgentResult<TOOLS>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_AGENT_TIMEOUT_MS);
  const useBedrockCaching = isBedrockModel(input.model);
  const cacheStrategy: CacheStrategy = useBedrockCaching ? "bedrock:system+last-message" : "none";
  try {
    // Cache points per ADR §6.1: one on the system prompt, one on the last (here, the only)
    // non-system message. Both are plain-string `system`/`prompt` on the Gateway path (no cache
    // control exists there), and cache-annotated `SystemModelMessage`/`ModelMessage[]` on Bedrock.
    const system = useBedrockCaching
      ? { role: "system" as const, content: input.system, providerOptions: BEDROCK_CACHE_POINT_PROVIDER_OPTIONS }
      : input.system;
    const prompt: string | ModelMessage[] = useBedrockCaching
      ? [{ role: "user" as const, content: input.prompt, providerOptions: BEDROCK_CACHE_POINT_PROVIDER_OPTIONS }]
      : input.prompt;
    const result = await generateText<TOOLS>({
      model: input.model,
      tools: input.tools,
      system,
      prompt,
      stopWhen: stepCountIs(RUN_AGENT_MAX_STEPS),
      abortSignal: controller.signal,
    });
    return { outcome: "ok", result, cacheStrategy };
  } catch (error) {
    if (isAbortError(error, controller)) {
      return { outcome: "timed_out" };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Re-exported so callers that need to annotate a variable with the full result type never have to
// import `GenerateTextResult` from `ai` directly just to spell this module's own return shape.
export type { GenerateTextResult };
