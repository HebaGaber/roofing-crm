# B-09 agent-design.md — design-agent consults (read-only, Phase B)

Per CLAUDE.md (constitution XIII–XVII): design agents are consulted read-only and their answers
are recorded here *before* `/speckit-plan`. Agents consulted: `alakazam` (Opus), `ash`, `smeargle`,
`porygon` (Sonnet) — per `stories/B-09-agent-hardening.md` front matter `agents.design`. None of
these agents wrote or edited any file; this document is the orchestrating session's own compilation
of their answers, plus two corrections found while compiling (below).

## Corrections found while compiling (resolved, no new PO decision needed)

1. **Confidence-threshold wording.** The story's edge-case bullet ("confidence below 0.80 → the
   agent asks a clarifying question") is an imprecise paraphrase. The binding source is
   `docs/architecture-constitution.md` ADR-06 (PO-accepted 2026-10-23): **auto ≥ 0.92 · clarify
   0.80–0.92 (or margin < 0.05 between top two candidates) · refuse/`not_found` < 0.80**. ADR-06
   governs. alakazam's own free-text recommendation drifted from this (it suggested "proceed with
   an assumption" for 0.80–0.92, which ADR-06 says should clarify, not proceed) — alakazam's
   *quoted* ADR-06 text is correct and is what the plan uses; its own recommendation is superseded
   by the already-accepted ADR. The story's edge-case line should be corrected to match ADR-06
   during `/speckit-plan`/spec touch-up.
2. **Prototype path.** The story's "Prototype reference" table points at `design/screens/CrmAsk*`.
   That directory doesn't exist; the real files are at `design/prototype/CrmAsk*.dc.html`
   (confirmed: `CrmAsk390/768/1440.dc.html`, `CrmAskWorking390`, `CrmAskNoResults390`,
   `CrmAskLowConf390`, `CrmAskNotFound390`, `CrmAskOutside390`, `CrmAskThrottled390`,
   `CrmAskPaused390`, `CrmAskSlow390`, `CrmAskConfirm390/1440`, `CrmAskCreated390`,
   `CrmAskCreateFailed390`, `CrmAskNoAddress390`, `CrmAskNoContractor390`, `CrmAskStates`). Use
   these paths in tasks.md and the Playwright spec; correct the story's table too.

---

## 1. alakazam — retrieval design (Opus consult)

**Shape:** structured hybrid RAG, no vectors. The model only ever sees real index rows returned by
typed tools.

**Tools** (`apps/api/src/services/agent/tools.ts`, routers thinned into shared services first:
`services/search.ts`, `services/propertyDetail.ts`, reused by both the existing routers and the
new agent tools):

- `geocodePlace({text})` → `{status: resolved|ambiguous|out_of_scope, placeId, name, point, kind, confidence, candidates≤3, source}`, via a `PlaceResolver` port wrapping `packages/oracle-views/gazetteer/travis-places@1.0.0`. The model gets a `placeId`, **never raw lat/lng** — it cannot invent a center.
- `searchProperties({placeId, radiusMi 0.5–25, roofAgeMinYears?, ownerAreaClass?, tenureYearsMin?, limit≤25})` — same two-call/`counts` pattern as `routers/search.ts`; `ownerAreaClass`/`tenureYearsMin` added to `SearchPropertiesQuery` in `adapters/duckDbParquet.ts` for golden query G4.
- `searchPermits({placeId?, radiusMi?, permitNumber?, isOpen?, openDaysMin?, sort:"openDays"})` — radius → propertyCids → `leadIndex.searchPermits` + `isLongOpen`; `permitNumber?` added for G5.
- `getProperty({propertyCid})` → `propertyDetail()`.
- `proposeLeads({propertyCids≤25})` — reads only (`getProperty`, `leadSignalsFrom`, dup-check), **writes nothing**, returns `CreateLeadInput` drafts with `createdFrom:"agent"`. The UI calls `leads.create` only after rep confirmation.

Model sees ≤25 compact rows/call; UI gets full rows via `resultSetId`. Owner name never sent to the model (ADR-03).

**Confidence/citations:** `services/agent/placeResolver.ts` (Jaro-Winkler fuzzy score, −0.05 if top-2 candidates are within 0.05) feeding ADR-06's bands (see correction #1 above). `services/agent/verifyCitations.ts`: every cited CID must (a) be in this ask's own tool-result set and (b) resolve via a batch `leadIndex.getProperty` against the current `manifestCid`; every number in the answer text must equal a tool `count`. Failures strip the bad CID and fall back to a deterministic template — never a fabricated claim. `AgentAnswer` Zod shape: `{outcome, text, assumptions[], center?, thresholds, counts, results[], citations[], clarify?, resultSetId, manifestCid, traceId, modelCalls}`, `outcome ∈ {answered, no_results, invalid_scope, ambiguous_place, timed_out, rate_limited, paused}`.

**Budget:** plan (Haiku-class) → tools → ≤1 repair → compose = ≤3 model calls (hard-fail counter), `AbortSignal.timeout(23_000)` on every call.

**Golden harness:** `tests/agent/golden.json` + `tests/agent/golden.test.ts` (Vitest), calling `agent.ask` over `RUNTIME_URL` (never localhost) as a Cognito eval user. Per-query assertions: groundedness (every cited CID resolves + `manifestCid` matches the pinned Run-1 CID), correctness (re-run `search.*` with the answer's stated center/thresholds, results ⊆ that set, recall ≥80%), honesty (center/thresholds stated in text; "BBB not available" shown correctly), G6 empty-scope, G7 lead-creation round-trip. Latency: p95 < 20s, max < 23.5s. `GOLDEN_REPEATS=3` (21 asks total), paced 13s apart to stay under 5/min. Unit tests use `MockLanguageModelV2`, including one asserting a planted fake CID gets stripped.

**Risks → proof:** fabricated CID → citation gate + `AgentCitationsStripped` metric at 0. Latency (442k-row DuckDB cold load + 2–3 model calls) → warm index, Haiku planner, ≤25 rows, prompt caching; proven by golden p95 table + dashboard widget. Rate/spend cap exhaustion during eval → 3 repeats/pacing, harness log shows no `paused`/`rate_limited`. Gazetteer exact-match-only → fuzzy layer + `partial_in_travis` caveat. BBB always `not_checked` in v1 → text must say "not available," never a rating. Prompt injection via record fields → rows sent as delimited JSON data, tool set closed. Data-switch drift (AC-7) → harness pins the manifest CID constant; swap-back is a one-constant change + rerun. Agent writes a lead directly → unit test asserts `proposeLeads` has no write port injected; live proof is the G7 lead showing `createdFrom:"agent"`.

## 2. ash — agent runtime design

**Files (new, native):** `apps/api/src/routers/agent.ts` (router/Zod/orchestration only), `apps/api/src/agent/getModel.ts` (`AI_PROVIDER` switch), `apps/api/src/agent/tools.ts`, `apps/api/src/agent/runAgent.ts` (tool loop + abort + guards), `apps/api/src/agent/rateLimiter.ts`, `apps/api/src/agent/spendCap.ts`, `apps/api/src/agentErrors.ts` (mirrors `leadErrors.ts`).

**Input:** `{question: string(1–500), threadId: string}`. **Output:** discriminated union so the client never guesses state — `answer | clarify | empty | proposal | lead_created | timed_out | throttled | over_budget`, each carrying `traceId`.

No `ai`/`@ai-sdk/amazon-bedrock` deps installed yet in `apps/api/package.json` — add them; Gateway path reuses the existing `~/.config/assessment/ai-gateway.env` key convention (never printed/committed). `getModel()` returns the Bedrock `eu.` inference-profile model when `AI_PROVIDER=bedrock`, or the Gateway model id when `AI_PROVIDER=gateway`; throws on anything else. `runAgent.ts` uses the SDK's own `generateText({model, tools, maxSteps:3, abortSignal})` — `maxSteps:3` directly encodes the ≤3-calls NFR, not a hand-rolled loop.

**Logging/abort:** reuse `@crm/observability`'s `createObservability("crm-api")` exactly as `leads.ts`/`search.ts` do; new metric constants `AgentAsksTotal`, `AgentToolCalls`, `AgentToolLatencyMs`, `AgentTimeouts`, `AgentThrottled`, `AgentOverBudget`. Per-tool-call log: `{procedure:"agent.ask", tool, requestId, latencyMs, argsShape: Object.keys(args)}` — never values (no question text, no address) per P0-13. 23s abort via `AbortController`/`setTimeout(23_000)`, caught and mapped to `{kind:"timed_out"}` — same pattern as `mapIndexNotReady` in `search.ts`, never rethrown as a 500.

**Rate limit + spend cap:** no existing table for this — add `crm-agent-usage` DynamoDB table (`crm-data-stack.ts`), two item shapes: `userId#windowMinute` (5/min check) and `userId#date` (atomic cents counter, $3/day cap), both enforced via conditional `UpdateItem` (same pattern B-07's `expectedSequence` conditional write uses) — in-memory counters rejected since Lambda sandboxes aren't shared. Throttled → `{kind:"throttled", retryAfterSec}` → `TRPCError TOO_MANY_REQUESTS`/`appCode:"RATE_LIMITED"` (same `withAppCode` mechanism as `ALREADY_EXISTS`). Spend cap checked *before* the model call (estimated cost), not after → `{kind:"over_budget"}`/`appCode:"OVER_BUDGET"`.

**Confirmation flow:** two turns, never a single model-authorized write. (1) Model calls `proposeLeads` (pure, no side effects) → router returns `{kind:"proposal", leads}`, nothing persisted. (2) Rep confirms via a **separate, non-model-invoked** mutation `agent.confirmLead`. (3) That mutation calls `requireLeadService(ctx).create(input, requireUserId(ctx))` — the exact same B-07 call path, `createdFrom:"agent"`. The model's tool set never includes anything that reaches `LeadService.create`; this is literally FR-002/AC-2/constitution P0's enforcement mechanism.

**Risks → proof:** fabricated CID → server-side citation check (ties to alakazam's gate). Abort racing a tool call → staging-only delay flag, confirm UI shows "took too long." Rate/spend-cap race → concurrent-request script against the hosted endpoint, expect exactly 5 successes. Confirm-flow bypass → grep `agent/tools.ts` for any `LeadService`/`requireLeadService` import (must appear only in the confirm mutation). AC-7 regression → before/after golden-query diff across the Atlas swap-back.

## 3. smeargle — responsive design (AC-5) + audino's AC-8 sibling piece

**Breakpoints:** no shared `tablet.css`/`compact.css` needed — B-01/B-03 already use CSS Modules with inline `@media` queries per component (`AppShell.module.css`, `NavRail.module.css` 600px rail breakpoint, `Map.module.css`, `PropertyDetail.module.css`, `Leads.module.css`, etc.) and `playwright.config.ts`'s three `projects` (`mobile-390`/`tablet-768`/`desktop-1440`) are the one real "breakpoints config." New Ask screen follows the same convention: `apps/web/src/routes/Ask/Ask.module.css`.

**Suite:** `tests/e2e/responsive/ask.spec.ts` (new), following `map-shell.spec.ts`'s exact shape (`signIn()` helper, `document.fonts.ready`), running under the existing three Playwright projects against `baseURL=RUNTIME_URL` (never localhost — enforced by `config-guard.spec.ts`). Add `tests/e2e/responsive/leads-shell.spec.ts` if LeadDetail/LeadsList aren't already covered (today's `map-shell.spec.ts` only covers Map+AppShell). Pass criteria (reused verbatim from `map-shell.spec.ts`): no horizontal overflow (`scrollWidth<=clientWidth`), correct layout-mode CSS at the rail breakpoint, correct compact/rail control visibility swap, bounding-box containment for reachable controls, and the existing `atlasTokenAudit` token check — no new 44px tap-target rule invented unless a prototype explicitly calls for it.

**Running live:** no new CI wiring needed — `playwright.config.ts` already gates `RUNTIME_URL` (hosted) vs. local dev server (pre-deploy only), forces `workers:1` (shared live Cognito account). Runs in Phase Z against the Amplify branch preview, same as B-03's TZ03.

**Risks:** each Ask state (`working`/`answer`/`no_results`/`low_confidence`/`throttled`/`paused`) needs its own `data-state` attribute (mirrors `CrmMapIndexDown390`'s precedent — a degraded state is valid proof, not failure); confirm attribute names against the corrected `design/prototype/CrmAsk*.dc.html` files (see correction #2). Throttled/paused are rate/cost-cap-dependent and not reliably reproducible live without a test-only trigger seam — add one, or defer with a reason per AC-8's own allowance. Low-confidence/no-results need deterministic seeded queries (ambiguous place name; ZIP 99999), same pattern as existing `GEORGETOWN`/`PFLUGERVILLE` constants. Run the full responsive suite once, *after* audino's AC-8 fixes land, not before.

## 4. porygon — metrics/observability design (AC-6, part of AC-4)

**Agent metrics** (add to `packages/observability/src/index.ts` `METRIC_NAMES`, emitted from the new `apps/api/src/routers/agent.ts` via the same `obs.metrics.addMetric(...)` pattern as `leads.ts`): `AgentAsksTotal` (Count, dim `outcome`), `AgentAnswerLatencyMs` (ms, drives AC-4 p95), `AgentCitationsTotal`/`AgentCitationsVerified`/`AgentCitationGroundednessRate` (reconciles cited CIDs against the same `LeadIndex` the routers already query — not a second index, not the MCP), `AgentLeadsProposed`, `AgentModelCallsTotal` (tracks the ≤3-call NFR). No per-CID dimension (high cardinality, unsuitable for a CloudWatch dashboard).

**DLQ + alarm:** **no new construct needed** — `infra/lib/crm-sync-stack.ts`'s `addFetchPartDlqAndAlarm()` already creates `FetchPartDlq` + `FetchPartDlqAlarm` (`ApproximateNumberOfMessagesVisible > 0`, `treatMissingData: NOT_BREACHING`, self-resolves on its own once depth returns to 0 — alarms are state-based, no custom resolve logic required), and `CrmSyncStack` already accepts an `alarmEmail` prop wired to an SNS `EmailSubscription`. AC-6 work is: confirm the stack is actually instantiated with `alarmEmail: "eng.heba.gaber@gmail.com"` wherever composed (check `infra/bin/*.ts`) — if omitted today, that's the whole fix, not a new alarm.

**`RoofingCrm` dashboard:** no dashboard CDK exists yet. Add `cloudwatch.Dashboard(this, "RoofingCrmDashboard", {dashboardName:"RoofingCrm"})` to `infra/lib/crm-ops-stack.ts` (or a new `crm-dashboard-stack.ts` if ops should stay auth-only — defer to metagross/builder judgment on stack boundary). Widgets: DLQ depth (reuse `CrmSyncStack.fetchPartDlq`'s metric), `AlarmStatusWidget` for `FetchPartDlqAlarm`, `AgentAnswerLatencyMs` p95, `AgentCitationGroundednessRate` (target line 100), golden-query pass rate (see below).

**AC-4 as an ongoing, not one-time, check** — three layers sharing one definition (cited CID ∈ current index): (1) CI/golden-harness run at merge time (`tests/agent/golden.json`, per checks.md §7.2); (2) a per-request runtime metric (`AgentCitationGroundednessRate`) on every real `agent.ask` call, with its own CloudWatch alarm so citation drift pages the same SNS topic as the DLQ alarm, not just failing quietly in a nightly test; (3) the CI/scheduled harness `PutMetricData`s a `GoldenQueryPassRate` custom metric so the dashboard trends the last real run instead of only a green CI badge.

**Risks:** none named beyond "don't let the same '100%' claim drift apart across CI/runtime/dashboard" — addressed by the one-definition/three-delivery-points design above.

---

## Net effect on Phase B → `/speckit-plan`

- Builder groups stay as the story's front matter: `alakazam` (retrieval: tools, place resolver, citation gate, golden harness), `ash` (agent runtime: router, getModel/AI_PROVIDER, tool loop, rate/spend guards, confirm-flow mutation), `metagross` (responsive config + Ask UI states + CloudWatch dashboard/DLQ-alarm wiring + agent business metrics — porygon's and smeargle's pieces both land as metagross tasks per the story's builder assignment, reviewed by porygon/audino/smeargle).
- Two corrections (confidence bands → ADR-06, prototype path → `design/prototype/`) get folded into the spec/story text during `/speckit-plan`, not escalated — both are already resolved by binding, previously-accepted documents.
- `/speckit-tasks` should produce 3 task groups matching the above, each importable task-by-task into its builder subagent per CLAUDE.md's kit-agent-ownership rule.
