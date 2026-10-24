// 009-agent-hardening architecture fix (ADR-06 §§4-6.3 as actually accepted, docs/decisions/
// 0000-agent-architecture.md; contracts/agent-api.md's `agent.ask` steps). This module used to
// turn a *finished tool-loop* `generateText` result into an `AgentAnswer`; it now owns the whole
// turn's orchestration (`runAsk`, below) because that orchestration — plan call, Zod-validate
// against the real `QueryPlan` schema with one repair call, the code-enforced scope gate,
// deterministic dispatch by `plan.intent`, the compose call, server citation verification — *is*
// the business logic this story's `/simplify` review found missing: a system-prompt instruction
// ("call no tool when out of scope") is not a structural guarantee, and the model being handed
// `tools: {...}` on every call meant it always had a path to retrieval even when the code wanted
// to refuse first. The fix is structural: `runAgent.ts`'s `generateOnce` is never given `tools`
// at all, and the scope gate below runs in plain TypeScript between the plan call and any
// dispatch — so an out-of-scope question cannot reach `dispatchPlan` or the compose call, not
// because the model was asked nicely, but because this function's own control flow never calls
// them on that path (proven by `apps/api/test/routers/agent.outOfScope.test.ts`: the mocked
// model's `doGenerate` is asserted to have been called exactly once, and the fake `LeadIndex`'s
// `searchProperties`/`searchPermits` are asserted never called).
import { gazetteer } from "@crm/oracle-views";
import { z } from "zod";
import {
  classifyPlaceConfidence,
  QueryPlan as QueryPlanSchema,
  type AgentAnswer,
  type PlaceResolver,
  type QueryPlan,
} from "@crm/shared";
import { METRIC_NAMES, type Observability } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { LeadIndex, PermitResult, PropertyResult } from "../adapters/duckDbParquet.js";
import type { LeadRepo } from "../adapters/leadRepo.js";
import { verifyCitations } from "../services/agent/verifyCitations.js";
import { createAgentDispatch, type AgentDispatch } from "../services/agent/tools.js";
import {
  generateOnce,
  withAgentTimeout,
  type CacheStrategy,
} from "./runAgent.js";
import type { LanguageModel } from "ai";

type Claim = AgentAnswer["claims"][number];
type Citation = AgentAnswer["citations"][number];

/** ADR §4/§6.2: "no more than 25 compact rows" go to the model — the UI pages the full set from
 *  `resultSetId`, never from the compose prompt. */
const MAX_ROWS_SHOWN = 25;

const PROMPT_VERSION = "2026-10-24";
const RANK_VERSION = "2026-10-24";

// ---------------------------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------------------------

/** Plan call (contracts/agent-api.md step 3): the model is asked ONLY to produce a
 *  `QueryPlan`-shaped JSON object — no tool exists on this call (`generateOnce` is never given
 *  `tools`), so there is nothing else it could do. */
export const PLAN_SYSTEM_PROMPT =
  "You are the Roofing CRM's agent, reading a rep's question about properties and roofing " +
  "permits in Travis County, Texas. Reply with ONLY a single JSON object matching this shape " +
  "(no prose, no markdown fence): " +
  '{"intent":"find_properties"|"find_permits"|"lookup_permit"|"lookup_property"|"coverage"|"propose_leads",' +
  '"area":{"kind":"place"|"zip"|"point"|"county","query":"<place name or ZIP as typed>","radiusMi":<0.5-25>},' +
  '"filters":{"roofAgeMinYears"?,"roofConfidenceMin"?,"statusClass"?,"openYearsMin"?,"tenureYearsMin"?,"kind"?,"permitNumber"?,"ownerAreaClass"?},' +
  '"slotSources":{"<field>":"stated"|"default"|"inherited"},' +
  '"unsupported":[{"constraint":"<text>","reason":"not_in_export"|"no_lexicon_carrier"|"out_of_scope"|"no_free_text"}]}. ' +
  "Default radiusMi to 5 and roofAgeMinYears to 15 when the rep didn't state them, and record " +
  'that in slotSources as "default". Never invent a place outside Travis County.';

function buildRepairPrompt(question: string, priorText: string, error: string): string {
  return (
    `The rep's question was: ${question}\n\n` +
    `Your previous reply did not parse as the required JSON shape. Your reply was:\n${priorText}\n\n` +
    `The validation error was: ${error}\n\n` +
    "Reply again with ONLY a corrected JSON object matching the exact shape described."
  );
}

/** Compose call (contracts/agent-api.md step 6): the model is given this turn's own
 *  server-gathered rows/counts as structured data and asked for `claims[]` citing them —
 *  again, no tool exists on this call (nothing left to look up). */
function buildComposeSystemPrompt(): string {
  return (
    "You are the Roofing CRM's agent. You have already been given this turn's search results " +
    "below, as data. Never invent a property, permit, address, contractor name or rating, and " +
    "never cite a citation id that isn't listed below. Reply with ONLY a single JSON object: " +
    '{"claims":[{"text":"<=400 chars","citationIds":[<id>,...]}],' +
    '"citations":[{"id":<id>,"propertyCid"?:"<cid>","permitCid"?:"<cid>"}]}. ' +
    "Every citationIds entry must reference a citation in the citations array you return, and " +
    "every citation's id/propertyCid/permitCid must come from the DATA block below — never from " +
    "outside it."
  );
}

function buildComposePrompt(plan: QueryPlan, gathered: DispatchedResult): string {
  const properties = [...gathered.properties.values()].slice(0, MAX_ROWS_SHOWN);
  const permits = [...gathered.permits.values()].slice(0, MAX_ROWS_SHOWN);
  const data = {
    intent: plan.intent,
    counts: gathered.searchCounts ?? null,
    properties: properties.map((p) => ({
      propertyCid: p.propertyCid,
      tcadId: p.requestIdentifier,
      lat: p.latitude,
      lon: p.longitude,
      roofAgeYears: p.roofAgeYears,
      roofAgeBasis: p.roofAgeBasis,
      roofAgeConfidence: p.roofAgeConfidence,
    })),
    permits: permits.map((p) => ({
      permitCid: p.permitCid,
      propertyCid: p.propertyCid,
      statusClass: p.statusClass,
      openDays: p.openDays,
      jurisdiction: p.jurisdiction,
    })),
  };
  return `DATA:\n${JSON.stringify(data)}`;
}

// ---------------------------------------------------------------------------------------------
// Scope gate (ADR-06 §5's flowchart — no model call, no tool call)
// ---------------------------------------------------------------------------------------------

export interface ScopeCheckDeps {
  readonly placeResolver: PlaceResolver;
}

export interface ScopePoint {
  readonly lat: number;
  readonly lon: number;
  readonly name: string;
  readonly match: "exact" | "alias" | "fuzzy" | "zip" | "user_point";
  readonly score: number;
}

export type ScopeOutcome =
  | { readonly status: "in_scope"; readonly point: ScopePoint }
  | { readonly status: "out_of_scope" | "not_found" | "needs_clarification" };

/** ADR-06 §5's flowchart, the part that needs no tool call and no model call: a ZIP checked
 *  against the gazetteer's Travis ZCTA list, or a place name scored and banded by
 *  `thresholds.ts`'s `classifyPlaceConfidence`. This is the code-enforced gate: its caller
 *  (`runAsk`, below) never calls `dispatchPlan` or the compose model when this returns anything
 *  other than `in_scope` — there is no code path from here to a tool/model call on that branch,
 *  which is what makes the gate structural rather than a system-prompt request the model could
 *  ignore. */
export async function checkScope(
  area: { kind: string; query: string },
  deps: ScopeCheckDeps,
): Promise<ScopeOutcome> {
  if (area.kind === "zip") {
    const found = gazetteer.lookup(area.query);
    if (found.status === "found" && found.kind === "zcta") {
      return {
        status: "in_scope",
        point: { lat: found.point.lat, lon: found.point.lon, name: found.name, match: "zip", score: 1 },
      };
    }
    return { status: "out_of_scope" };
  }
  const resolution = await deps.placeResolver.resolve(area.query);
  if (resolution.status === "out_of_scope") return { status: "out_of_scope" };
  const [top, ...rest] = resolution.candidates;
  if (top === undefined) return { status: "not_found" };
  // `placeResolver.ts`'s fuzzy runner-up list is deduped by *name string*, not by place identity
  // — a gazetteer place with both a bare-name and an LSAD-suffixed form (e.g. "Pflugerville" and
  // "Pflugerville city") can surface as two distinct candidates for the *same* point, which would
  // zero out the margin for an exact match and wrongly route it to `needs_clarification`. The
  // margin is only meaningful against a genuinely different place, so the runner-up here is the
  // first candidate at a different point than the top one.
  const runnerUp = rest.find((c) => c.lat !== top.lat || c.lon !== top.lon);
  const margin = runnerUp === undefined ? 1 : top.score - runnerUp.score;
  const band = classifyPlaceConfidence(top.score, margin);
  if (band === "refuse") return { status: "not_found" };
  if (band === "clarify") return { status: "needs_clarification" };
  return {
    status: "in_scope",
    point: { lat: top.lat, lon: top.lon, name: top.name, match: top.match, score: top.score },
  };
}

// ---------------------------------------------------------------------------------------------
// Deterministic dispatch (ADR-06 §6.1 "deterministic tool dispatch" — no model call)
// ---------------------------------------------------------------------------------------------

interface DispatchedResult {
  readonly properties: ReadonlyMap<string, PropertyResult>;
  readonly permits: ReadonlyMap<string, PermitResult>;
  readonly searchCounts: { readonly afterRadius: number; readonly afterRoofAge: number } | undefined;
  readonly proposals: ReadonlyArray<{ tcadId: string; alreadyLead: boolean; leadId: string | undefined }>;
  readonly manifestCid: string;
}

/** `QueryPlan.intent` tells this function exactly which service function(s) to call — the model
 *  never decides which function runs; this reads `plan.intent` and calls the matching dispatch
 *  function(s) from `services/agent/tools.ts`'s `createAgentDispatch` directly (ADR §6.1). */
async function dispatchPlan(
  plan: QueryPlan,
  point: ScopePoint,
  dispatch: AgentDispatch,
  manifestCidFallback: string,
): Promise<DispatchedResult> {
  const empty: DispatchedResult = {
    properties: new Map(),
    permits: new Map(),
    searchCounts: undefined,
    proposals: [],
    manifestCid: manifestCidFallback,
  };

  switch (plan.intent) {
    case "find_properties": {
      const result = await dispatch.searchProperties({
        lat: point.lat,
        lon: point.lon,
        radiusMi: plan.area.radiusMi,
        roofAgeMinYears: plan.filters.roofAgeMinYears,
        ownerAreaClass: plan.filters.ownerAreaClass,
        tenureYearsMin: plan.filters.tenureYearsMin,
      });
      return {
        properties: new Map(result.properties.map((p) => [p.propertyCid, p])),
        permits: new Map(),
        searchCounts: result.counts,
        proposals: [],
        manifestCid: result.manifestCid,
      };
    }
    case "find_permits":
    case "lookup_permit": {
      const result = await dispatch.searchPermits({
        lat: point.lat,
        lon: point.lon,
        radiusMi: plan.area.radiusMi,
        statusClass: plan.filters.statusClass,
        openYearsMin: plan.filters.openYearsMin,
        permitNumber: plan.filters.permitNumber,
      });
      return {
        properties: new Map(),
        permits: new Map(result.permits.map((p) => [p.permitCid, p])),
        searchCounts: undefined,
        proposals: [],
        manifestCid: result.manifestCid,
      };
    }
    case "lookup_property": {
      // Judgment call (see the builder's report): QueryPlan carries no explicit tcadId/
      // propertyCid field, only `area.query` ("what the user typed"). For this intent that text
      // is read as the identifier the rep asked about.
      const found = await dispatch.getProperty({ tcadId: plan.area.query });
      if (!found.found) return empty;
      return {
        properties: new Map([[found.property.propertyCid, found.property]]),
        permits: new Map(found.permits.map((p) => [p.permitCid, p])),
        searchCounts: undefined,
        proposals: [],
        manifestCid: found.manifestCid,
      };
    }
    case "coverage": {
      const info = await dispatch.getCoverage();
      return { ...empty, manifestCid: info.manifestCid };
    }
    case "propose_leads": {
      // Judgment call (see the builder's report): QueryPlan carries no explicit tcadIds[] field
      // either. This intent is read as "propose leads for the properties this area/filter set
      // matches" — the same search `find_properties` runs, then a proposal check over its rows.
      const searchResult = await dispatch.searchProperties({
        lat: point.lat,
        lon: point.lon,
        radiusMi: plan.area.radiusMi,
        roofAgeMinYears: plan.filters.roofAgeMinYears,
        ownerAreaClass: plan.filters.ownerAreaClass,
        tenureYearsMin: plan.filters.tenureYearsMin,
      });
      const tcadIds = searchResult.properties.map((p) => p.requestIdentifier);
      const proposed = tcadIds.length > 0 ? await dispatch.proposeLeads({ tcadIds }) : { proposals: [] };
      return {
        properties: new Map(searchResult.properties.map((p) => [p.propertyCid, p])),
        permits: new Map(),
        searchCounts: searchResult.counts,
        proposals: proposed.proposals,
        manifestCid: searchResult.manifestCid,
      };
    }
    default:
      return empty;
  }
}

// ---------------------------------------------------------------------------------------------
// Plan parsing (Zod-validated against the REAL, full QueryPlan schema — no looser ad-hoc shape)
// ---------------------------------------------------------------------------------------------

/** Parses and Zod-validates the plan call's text against the full `QueryPlan` schema (ADR §4) —
 *  not a looser, ad-hoc shape. Returns the parsed error message (for the repair prompt) on
 *  failure rather than throwing, so the caller can build the one allowed repair call. */
function tryParsePlan(text: string): { ok: true; plan: QueryPlan } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "invalid JSON" };
  }
  const parsed = QueryPlanSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, plan: parsed.data };
}

/** The model's compose-step output shape (contracts/agent-api.md step 6): claims plus which
 *  citation ids they rely on, and the model's own (untrusted) idea of what each id refers to. Only
 *  `claims[].citationIds` and `citations[].{id,propertyCid,permitCid}` are ever trusted from this
 *  — every other citation field (`sourceUrl`, `capturedAt`, `tableCid`, `manifestCid`, `asOf`) is
 *  rebuilt server-side from this turn's own dispatch results, never copied from model text. */
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

export const EMPTY_COUNTS: AgentAnswer["counts"] = {
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

/** `AgentCitationsTotal`/`AgentCitationsVerified`/`AgentCitationGroundednessRate`/
 *  `AgentLeadsProposed` (contracts/observability.md agent-metrics table) — emitted from one call
 *  site (`runAsk`'s own end, below) so every real `agent.ask` call reports these four, regardless
 *  of which outcome branch produced the answer. No per-`property_cid` dimension
 *  (high-cardinality). */
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

function trace(
  traceId: string,
  modelId: string,
  modelCalls: number,
  cacheStrategy: string,
  toolSteps: number,
  cacheReadTokens?: number,
  cacheWriteTokens?: number,
): AgentAnswer["trace"] {
  return {
    traceId,
    modelId,
    promptVersion: PROMPT_VERSION,
    rankVersion: RANK_VERSION,
    toolSteps,
    modelCalls,
    cacheStrategy,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
  };
}

/** Builds a deterministic, no-claims `AgentAnswer` for every short-circuit outcome (invalid plan
 *  after the repair call, scope-gate refusal/clarify, or a timeout) — never model text. */
export function emptyAnswer(
  outcome: AgentAnswer["outcome"],
  plan: QueryPlan,
  traceId: string,
  modelCalls: number,
  modelId = "n/a",
  cacheStrategy: string = "none",
): AgentAnswer {
  return {
    outcome,
    claims: [],
    citations: [],
    plan,
    resultSetId: traceId,
    counts: EMPTY_COUNTS,
    missing: [],
    trace: trace(traceId, modelId, modelCalls, cacheStrategy, 0),
  };
}

// ---------------------------------------------------------------------------------------------
// Orchestration: the whole `agent.ask` turn
// ---------------------------------------------------------------------------------------------

export interface RunAskInput {
  readonly model: LanguageModel;
  readonly leadIndex: LeadIndex;
  readonly leadRepo: LeadRepo;
  readonly placeResolver: PlaceResolver;
  readonly question: string;
  readonly traceId: string;
  readonly obs: Observability;
}

type PlanTurnResult =
  | { readonly kind: "invalid_plan"; readonly modelCalls: number; readonly cacheStrategy: CacheStrategy }
  | {
      readonly kind: "scope_blocked";
      readonly status: "out_of_scope" | "not_found" | "needs_clarification";
      readonly plan: QueryPlan;
      readonly modelCalls: number;
      readonly cacheStrategy: CacheStrategy;
    }
  | {
      readonly kind: "composed";
      readonly plan: QueryPlan;
      readonly gathered: DispatchedResult;
      readonly composeText: string;
      readonly modelCalls: number;
      readonly cacheStrategy: CacheStrategy;
      readonly cacheReadTokens?: number;
      readonly cacheWriteTokens?: number;
    };

/** contracts/agent-api.md's `agent.ask` steps 3-7, as one function: plan call (Zod-validated
 *  against the real `QueryPlan`, one repair call on failure) -> code-enforced scope gate (no
 *  model/tool call) -> deterministic dispatch by `plan.intent` (no model call) -> compose call ->
 *  server citation verification (no model call). The model is called **at most 3 times** total
 *  (plan, <=1 repair, compose) — enforced structurally: this function's own control flow never
 *  contains a loop a model's output could extend; it calls `generateOnce` from at most 3 fixed
 *  call sites, full stop.
 *
 *  The 23s timeout (`withAgentTimeout`) wraps this entire sequence, not just one model call —
 *  the ADR-06 §6.1 "nested timeout" layering applies to the whole turn. */
export async function runAsk(input: RunAskInput): Promise<AgentAnswer> {
  const { model, leadIndex, leadRepo, placeResolver, question, traceId, obs } = input;
  const modelId = typeof model === "string" ? model : model.modelId;
  const dispatch = createAgentDispatch({ leadIndex, leadRepo, placeResolver });

  const timed = await withAgentTimeout<PlanTurnResult>(async (signal) => {
    // Step 3: plan call.
    const planCall = await generateOnce({ model, system: PLAN_SYSTEM_PROMPT, prompt: question }, signal);
    let modelCalls = 1;
    let cacheStrategy = planCall.cacheStrategy;
    let cacheReadTokens = planCall.cacheReadTokens;
    let cacheWriteTokens = planCall.cacheWriteTokens;
    let parsed = tryParsePlan(planCall.text);

    // One repair call on invalid JSON/Zod failure (ADR §4/§6.1: "one repair call... then
    // re-validate. If still invalid, needs_clarification with no further calls").
    if (!parsed.ok) {
      const repairCall = await generateOnce(
        {
          model,
          system: PLAN_SYSTEM_PROMPT,
          prompt: buildRepairPrompt(question, planCall.text, parsed.error),
        },
        signal,
      );
      modelCalls = 2;
      cacheStrategy = repairCall.cacheStrategy;
      cacheReadTokens = repairCall.cacheReadTokens;
      cacheWriteTokens = repairCall.cacheWriteTokens;
      parsed = tryParsePlan(repairCall.text);
    }

    if (!parsed.ok) {
      return { kind: "invalid_plan", modelCalls, cacheStrategy };
    }
    const plan = parsed.plan;

    // Step 4: code-enforced scope gate. No model/tool call happens past this point on any branch
    // other than "in_scope" — see `checkScope`'s own doc comment and
    // `agent.outOfScope.test.ts`'s assertion that `doGenerate` was called exactly once.
    const scope = await checkScope(plan.area, { placeResolver });
    if (scope.status !== "in_scope") {
      return { kind: "scope_blocked", status: scope.status, plan, modelCalls, cacheStrategy };
    }

    // Step 5: deterministic dispatch by `plan.intent` — no model call.
    const { manifestCid: fallbackManifestCid } = await leadIndex.indexInfo();
    const gathered = await dispatchPlan(plan, scope.point, dispatch, fallbackManifestCid);

    // Step 6: compose call.
    const composeCall = await generateOnce(
      {
        model,
        system: buildComposeSystemPrompt(),
        prompt: buildComposePrompt(plan, gathered),
      },
      signal,
    );
    modelCalls += 1;

    return {
      kind: "composed",
      plan,
      gathered,
      composeText: composeCall.text,
      modelCalls,
      cacheStrategy: composeCall.cacheStrategy,
      ...(composeCall.cacheReadTokens === undefined ? {} : { cacheReadTokens: composeCall.cacheReadTokens }),
      ...(composeCall.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: composeCall.cacheWriteTokens }),
    };
  });

  if (timed.outcome === "timed_out") {
    emitCitationMetrics(obs, { citationsTotal: 0, citationsVerified: 0, leadsProposed: 0 });
    return emptyAnswer("timed_out", emptyPlan(question), traceId, 0, modelId);
  }

  const turn = timed.result;

  if (turn.kind === "invalid_plan") {
    emitCitationMetrics(obs, { citationsTotal: 0, citationsVerified: 0, leadsProposed: 0 });
    return emptyAnswer(
      "needs_clarification",
      emptyPlan(question),
      traceId,
      turn.modelCalls,
      modelId,
      turn.cacheStrategy,
    );
  }

  if (turn.kind === "scope_blocked") {
    emitCitationMetrics(obs, { citationsTotal: 0, citationsVerified: 0, leadsProposed: 0 });
    return emptyAnswer(turn.status, turn.plan, traceId, turn.modelCalls, modelId, turn.cacheStrategy);
  }

  // turn.kind === "composed" — step 7: server citation verification.
  const { plan, gathered, composeText, modelCalls, cacheStrategy, cacheReadTokens, cacheWriteTokens } = turn;

  const matched = gathered.searchCounts?.afterRoofAge ?? gathered.searchCounts?.afterRadius ?? 0;
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
      ? gathered.proposals.map((p) => ({
          tcadId: p.tcadId,
          alreadyLead: p.alreadyLead,
          ...(p.leadId === undefined ? {} : { leadId: p.leadId }),
        }))
      : undefined;

  let rawClaims: Claim[] = [];
  let rawCitations: Citation[] = [];
  try {
    const parsed = RawComposeOutput.parse(JSON.parse(composeText));
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
    // outcome below falls through to empty_in_scope/answered with zero claims, never fabricated
    // text.
  }

  // Only a citation id that actually resolved to a real dispatch-result row above (so a planted,
  // never-returned CID can never even reach `toolResultCitationIds`) counts as "this turn's own".
  const toolResultCitationIds = new Set(rawCitations.map((c) => c.id));

  const verified = await verifyCitations({
    claims: rawClaims,
    citations: rawCitations,
    toolResultCitationIds,
    leadIndex,
    manifestCid: gathered.manifestCid,
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
    matched === 0 && verified.claims.length === 0 ? "empty_in_scope" : "answered";

  return {
    outcome,
    claims: verified.claims,
    citations,
    plan,
    resultSetId: traceId,
    counts,
    missing: [],
    ...(proposals === undefined ? {} : { proposals }),
    trace: trace(traceId, modelId, modelCalls, cacheStrategy, 0, cacheReadTokens, cacheWriteTokens),
  };
}
