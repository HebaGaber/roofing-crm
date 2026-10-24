// Supporting logic for T035's `agent.ask`, split out of the router (thin-router convention,
// agent-design.md alakazam §1) because assembling an `AgentAnswer` out of one `generateText` call
// genuinely has business logic in it: which tool results are "this turn's" ground truth, how a
// citation record is built (from the real tool-result row, never from the model's own citation
// metadata), and the scope/confidence short-circuit (ADR-06 §5) for the case where the model
// never called a tool at all.
import { gazetteer } from "@crm/oracle-views";
import { z } from "zod";
import {
  classifyPlaceConfidence,
  type AgentAnswer,
  type PlaceResolver,
  type QueryPlan,
} from "@crm/shared";
import { METRIC_NAMES, type Observability } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { LeadIndex, PermitResult, PropertyResult } from "../adapters/duckDbParquet.js";
import { verifyCitations } from "../services/agent/verifyCitations.js";
import type { AgentTools } from "../services/agent/tools.js";
import { runAgent } from "./runAgent.js";

/** The `{outcome: "ok"}` branch of `runAgent`'s result, narrowed once here so the rest of this
 *  module (and `routers/agent.ts`) never has to re-derive `generateText`'s own generic result
 *  type — `runAgent<AgentTools>` is the one call site that fixes the `TOOLS` type parameter. */
export type AgentRunResult = Extract<
  Awaited<ReturnType<typeof runAgent<AgentTools>>>,
  { outcome: "ok" }
>["result"];

type Claim = AgentAnswer["claims"][number];
type Citation = AgentAnswer["citations"][number];

const MAX_ROWS_SHOWN = 25;

/** The model's own compose-step output shape (contracts/agent-api.md step 6): claims plus which
 *  citation ids they rely on, and the model's own (untrusted) idea of what each id refers to. Only
 *  `claims[].citationIds` and `citations[].{id,propertyCid,permitCid}` are ever trusted from this
 *  — every other citation field (`sourceUrl`, `capturedAt`, `tableCid`, `manifestCid`, `asOf`) is
 *  rebuilt server-side from this turn's own tool results, never copied from model text. */
const RawComposeOutput = z.object({
  claims: z.array(z.object({ text: z.string(), citationIds: z.array(z.number().int()) })),
  citations: z.array(
    z.object({
      id: z.number().int(),
      kind: z.enum(["property", "permit", "run", "place"]).optional(),
      propertyCid: z.string().optional(),
      permitCid: z.string().optional(),
    }),
  ),
});

/** The model's plan-shaped draft (ADR-06 §4), as produced on a turn where it answered in text
 *  without ever calling a tool — the scope/confidence check (step 4) reads from this. Looser than
 *  the full `QueryPlan` Zod shape on purpose: this is the model's own first-pass JSON, not yet
 *  validated against the full schema (a stricter validation plus a repair retry is the ADR's
 *  "invalid twice -> clarify" path, not built this round — see the builder's report). */
const RawPlanDraft = z.object({
  intent: z.string().optional(),
  area: z.object({
    kind: z.enum(["place", "zip", "point", "county"]),
    query: z.string().max(80),
  }),
  filters: z.record(z.unknown()).optional(),
});

export interface ScopeCheckDeps {
  readonly placeResolver: PlaceResolver;
}

export type ScopeOutcome =
  | { readonly status: "in_scope" }
  | { readonly status: "out_of_scope" | "not_found" | "needs_clarification" };

/** ADR-06 §5's flowchart, the part that needs no tool call: a ZIP checked against the gazetteer's
 *  Travis ZCTA list, or a place name scored and banded by `thresholds.ts`'s
 *  `classifyPlaceConfidence`. */
export async function checkScope(
  area: { kind: string; query: string },
  deps: ScopeCheckDeps,
): Promise<ScopeOutcome> {
  if (area.kind === "zip") {
    const found = gazetteer.lookup(area.query);
    if (found.status === "found" && found.kind === "zcta") return { status: "in_scope" };
    return { status: "out_of_scope" };
  }
  const resolution = await deps.placeResolver.resolve(area.query);
  if (resolution.status === "out_of_scope") return { status: "out_of_scope" };
  const [top, runnerUp] = resolution.candidates;
  if (top === undefined) return { status: "not_found" };
  const margin = runnerUp === undefined ? 1 : top.score - runnerUp.score;
  const band = classifyPlaceConfidence(top.score, margin);
  if (band === "refuse") return { status: "not_found" };
  if (band === "clarify") return { status: "needs_clarification" };
  return { status: "in_scope" };
}

/** Parses the final step's text as the out-of-tool-loop plan draft (no tool was ever called this
 *  turn). `undefined` when the text isn't JSON-shaped like a plan at all — the caller treats that
 *  as a clarification case (ADR §5: "invalid... -> needs_clarification with examples"). */
export function parsePlanDraftText(text: string): { kind: string; query: string } | undefined {
  try {
    const parsed = RawPlanDraft.parse(JSON.parse(text));
    return parsed.area;
  } catch {
    return undefined;
  }
}

interface GatheredToolResults {
  readonly calledAnyTool: boolean;
  readonly manifestCid: string | undefined;
  readonly properties: ReadonlyMap<string, PropertyResult>;
  readonly permits: ReadonlyMap<string, PermitResult>;
  readonly searchCounts: { readonly afterRadius: number; readonly afterRoofAge: number } | undefined;
  readonly proposals: ReadonlyArray<{ tcadId: string; alreadyLead: boolean; leadId?: string }>;
}

/** Narrow, structural checks on a tool's `execute()` return value — this module intentionally
 *  does not import `AgentTools`' generic tool-output types (the AI SDK's own typed-tool-result
 *  generics are already carried on `steps[].toolResults` via `GenerateTextResult<AgentTools, …>`,
 *  but narrowing them back out per `toolName` is simplest done structurally here, by the same
 *  shape `services/agent/tools.ts` itself returns). */
function isPropertySearchOutput(
  value: unknown,
): value is { manifestCid: string; counts: { afterRadius: number; afterRoofAge: number }; properties: PropertyResult[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "properties" in value &&
    Array.isArray((value as { properties: unknown }).properties)
  );
}

function isPermitSearchOutput(
  value: unknown,
): value is { manifestCid: string; permits: PermitResult[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "permits" in value &&
    Array.isArray((value as { permits: unknown }).permits)
  );
}

function isGetPropertyOutput(
  value: unknown,
): value is { found: boolean; manifestCid?: string; property?: PropertyResult; permits?: PermitResult[] } {
  return typeof value === "object" && value !== null && "found" in value;
}

function isProposeLeadsOutput(
  value: unknown,
): value is { proposals: { tcadId: string; alreadyLead: boolean; leadId?: string }[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "proposals" in value &&
    Array.isArray((value as { proposals: unknown }).proposals)
  );
}

/** Collects every `properties`/`permits`/`proposals` row any tool call surfaced this turn — this
 *  is the entire "ground truth" the compose step is allowed to cite against (ADR §4/§5's
 *  groundedness rule), gathered from the tool results themselves, never from the model's own
 *  text. */
export function gatherToolResults(
  result: AgentRunResult,
): GatheredToolResults {
  const properties = new Map<string, PropertyResult>();
  const permits = new Map<string, PermitResult>();
  const proposals: { tcadId: string; alreadyLead: boolean; leadId?: string }[] = [];
  let manifestCid: string | undefined;
  let searchCounts: { afterRadius: number; afterRoofAge: number } | undefined;
  let calledAnyTool = false;

  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      calledAnyTool = true;
      const output: unknown = toolResult.output;
      if (isPropertySearchOutput(output)) {
        manifestCid = output.manifestCid;
        searchCounts = output.counts;
        for (const property of output.properties) properties.set(property.propertyCid, property);
      } else if (isPermitSearchOutput(output)) {
        manifestCid = output.manifestCid;
        for (const permit of output.permits) permits.set(permit.permitCid, permit);
      } else if (isGetPropertyOutput(output) && output.found && output.property !== undefined) {
        manifestCid = output.manifestCid ?? manifestCid;
        properties.set(output.property.propertyCid, output.property);
        for (const permit of output.permits ?? []) permits.set(permit.permitCid, permit);
      } else if (isProposeLeadsOutput(output)) {
        proposals.push(...output.proposals);
      }
    }
  }

  return { calledAnyTool, manifestCid, properties, permits, searchCounts, proposals };
}

function propertyCitation(property: PropertyResult, id: number): Citation {
  return {
    id,
    kind: "property",
    tcadId: property.requestIdentifier,
    propertyCid: property.propertyCid,
    sourceUrl: null,
    capturedAt: property.capturedAt,
    // `Provenanced<CrmProperty>` carries the row's own content-addressed `cid`, not a separate
    // per-table CID — used here for `tableCid` as the closest provenance handle this round's
    // index-schema exposes (noted as a simplification in the builder's report).
    tableCid: property.cid,
    manifestCid: property.sourceManifestCid,
    asOf: property.capturedAt,
  };
}

function permitCitation(permit: PermitResult, id: number): Citation {
  return {
    id,
    kind: "permit",
    propertyCid: permit.propertyCid,
    permitCid: permit.permitCid,
    sourceUrl: null,
    capturedAt: permit.capturedAt,
    tableCid: permit.cid,
    manifestCid: permit.sourceManifestCid,
    asOf: permit.capturedAt,
  };
}

const EMPTY_COUNTS: AgentAnswer["counts"] = {
  matched: 0,
  shown: 0,
  excludedNoCoordinates: 0,
  excludedNoRoofDate: 0,
  truncated: false,
};

export function emptyPlan(areaQuery: string): QueryPlan {
  return {
    intent: "find_properties",
    area: { kind: "place", query: areaQuery.slice(0, 80), radiusMi: 5 },
    filters: {},
    slotSources: {},
    unsupported: [],
  };
}

export interface ComposeInput {
  readonly result: AgentRunResult;
  readonly leadIndex: LeadIndex;
  readonly manifestCid: string;
  readonly plan: QueryPlan;
  readonly traceId: string;
  readonly modelId: string;
  readonly obs: Observability;
  /** T045 (ADR §6.1 trace-metadata requirement): which cache strategy `runAgent` used this turn
   *  (`runAgent.ts`'s `CacheStrategy`) — `"none"` on the Gateway path. */
  readonly cacheStrategy: string;
}

/** `AgentCitationsTotal`/`AgentCitationsVerified`/`AgentCitationGroundednessRate`/
 *  `AgentLeadsProposed` (contracts/observability.md agent-metrics table) — emitted from the
 *  citation verifier's own call site (here, and from `routers/agent.ts`'s early-return branches
 *  where no citation ever existed) so every real `agent.ask` call reports these four, regardless
 *  of which code path produced the answer. No per-`property_cid` dimension (high-cardinality). */
export function emitCitationMetrics(
  obs: Observability,
  counts: {
    readonly citationsTotal: number;
    readonly citationsVerified: number;
    readonly leadsProposed: number;
  },
): void {
  const { citationsTotal, citationsVerified, leadsProposed } = counts;
  obs.metrics.addMetric(METRIC_NAMES.AgentCitationsTotal, MetricUnit.Count, citationsTotal);
  obs.metrics.addMetric(METRIC_NAMES.AgentCitationsVerified, MetricUnit.Count, citationsVerified);
  // Nothing was ever cited (e.g. empty_in_scope) -> trivially 100: there is no ungrounded claim to
  // report, and 0/0 must never render as the dashboard's alarm-triggering 0%.
  const groundednessRate =
    citationsTotal === 0 ? 100 : (citationsVerified / citationsTotal) * 100;
  obs.metrics.addMetric(
    METRIC_NAMES.AgentCitationGroundednessRate,
    MetricUnit.Percent,
    groundednessRate,
  );
  obs.metrics.addMetric(METRIC_NAMES.AgentLeadsProposed, MetricUnit.Count, leadsProposed);
}

/** Turns a finished tool-loop `generateText` result into an `AgentAnswer` (contracts/agent-api.md
 *  steps 6-7): parses the final step's text as the compose JSON, rebuilds every citation from
 *  this turn's own tool results (never from the model's citation metadata), runs the server-side
 *  verifier, and keeps only the citations the surviving claims actually reference. */
export async function composeAnswer(input: ComposeInput): Promise<AgentAnswer> {
  const { result, leadIndex, manifestCid, plan, traceId, modelId, obs, cacheStrategy } = input;
  const gathered = gatherToolResults(result);
  const modelCalls = result.steps.length;

  const matched = gathered.searchCounts?.afterRoofAge ?? gathered.searchCounts?.afterRadius ?? 0;
  const shown = Math.min(matched, MAX_ROWS_SHOWN, gathered.properties.size || matched);
  const counts: AgentAnswer["counts"] = gathered.searchCounts
    ? {
        matched,
        shown: gathered.properties.size,
        excludedNoCoordinates: 0,
        excludedNoRoofDate: 0,
        truncated: matched > MAX_ROWS_SHOWN,
      }
    : EMPTY_COUNTS;

  const proposals =
    gathered.proposals.length > 0
      ? gathered.proposals.map((p) => ({ tcadId: p.tcadId, alreadyLead: p.alreadyLead, leadId: p.leadId }))
      : undefined;

  // T045 (ADR §6.1): `result.usage` is `generateText`'s own summed-across-all-steps usage
  // (`GenerateTextResult.usage` docstring: "the usage is the sum of all step usages"), so this is
  // the whole turn's cache read/write count, not just the final step's. `inputTokenDetails` is
  // `undefined` only if the provider never reported usage at all (e.g. an aborted/mocked call);
  // the per-field `cacheReadTokens`/`cacheWriteTokens` are `undefined` on any provider (including
  // Gateway) that doesn't report prompt-cache token counts.
  const cacheReadTokens = result.usage.inputTokenDetails?.cacheReadTokens;
  const cacheWriteTokens = result.usage.inputTokenDetails?.cacheWriteTokens;

  const trace: AgentAnswer["trace"] = {
    traceId,
    modelId,
    promptVersion: "2026-10-23",
    rankVersion: "2026-10-23",
    toolSteps: result.steps.reduce((sum, step) => sum + step.toolResults.length, 0),
    modelCalls,
    cacheStrategy,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
  };

  let rawClaims: Claim[] = [];
  let rawCitations: Citation[] = [];
  try {
    const parsed = RawComposeOutput.parse(JSON.parse(result.text));
    rawClaims = parsed.claims;
    rawCitations = parsed.citations
      .map((c): Citation | undefined => {
        if (c.propertyCid !== undefined) {
          const property = gathered.properties.get(c.propertyCid);
          return property === undefined ? undefined : propertyCitation(property, c.id);
        }
        if (c.permitCid !== undefined) {
          const permit = gathered.permits.get(c.permitCid);
          return permit === undefined ? undefined : permitCitation(permit, c.id);
        }
        return undefined;
      })
      .filter((c): c is Citation => c !== undefined);
  } catch {
    // Not JSON-shaped compose output (e.g. a plain-prose answer) — no claims, no citations; the
    // caller falls through to `empty_in_scope`/`answered` with zero claims, never fabricated text.
  }

  // Only a citation id that actually resolved to a real tool-result row above (so a planted,
  // never-returned CID can never even reach `toolResultCitationIds`) counts as "this turn's own".
  const toolResultCitationIds = new Set(rawCitations.map((c) => c.id));

  const verified = await verifyCitations({
    claims: rawClaims,
    citations: rawCitations,
    toolResultCitationIds,
    leadIndex,
    manifestCid,
    counts,
  });

  const keptCitationIds = new Set(verified.claims.flatMap((claim) => claim.citationIds));
  const citations = rawCitations.filter((c) => keptCitationIds.has(c.id));

  emitCitationMetrics(obs, {
    citationsTotal: rawCitations.length,
    citationsVerified: citations.length,
    leadsProposed: gathered.proposals.length,
  });

  const outcome: AgentAnswer["outcome"] =
    verified.claims.length > 0 ? "answered" : matched === 0 ? "empty_in_scope" : "answered";

  return {
    outcome,
    claims: verified.claims,
    citations,
    plan,
    resultSetId: traceId,
    counts,
    missing: [],
    ...(proposals === undefined ? {} : { proposals }),
    trace,
  };
}
