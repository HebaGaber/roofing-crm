---

description: "Task list for B-07 Create, manage and browse CRM leads"
---

# Tasks: Create, manage and browse CRM leads

**Input**: Design documents from `specs/007-leads/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/leads.md, quickstart.md

**Tests**: MANDATORY (constitution X, XXI, XXII). Test tasks come first in every group and must fail before their implementation tasks run. Phase Z (prove on hosted runtime) is run in Phase D of the walkthrough, not here — `/speckit-implement` stops before it.

**Builder**: every implementation task is delegated to `metagross` (story front matter `agents.builder`), per constitution XV. At most two builder subagents run per `/speckit-implement` call, one per group below.

**Organization**: Grouped into exactly two task groups (not by the spec's four user stories) per this story's walkthrough — "lead store + tRPC procedures" and "lead list UI + URL-encoded filters" — so `/speckit-implement` can delegate each to one `metagross` builder subagent in a single message.

## Format: `[ID] [P?] [Group] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Group]**: `[GA]` lead store + tRPC procedures, `[GB]` lead list UI + URL-encoded filters

---

## Phase 1: Setup

- [ ] T001 Confirm `packages/shared`, `packages/domain`, `apps/api`, `apps/web` build and test clean on `007-leads` before adding anything (`pnpm turbo run build test --filter=...`)
- [ ] T002 [P] Add the `crm-leads` DynamoDB table construct skeleton (no attributes yet) to the `CrmData` CDK stack in `infra/`, tagged `project_name=roofing-crm`, region from config

---

## Phase 2: Foundational (blocking both groups)

- [ ] T003 Define `Lead`, `LeadSignals`, `LeadEvent`, `LeadFilters` Zod schemas in `packages/shared/src/schemas/lead.ts` per data-model.md (status enum `new|contacted|qualified|won|lost`; note text has no length cap in the schema itself — enforced at the tRPC input boundary per T011)
- [ ] T004 [P] Export the new schemas from `packages/shared/src/index.ts`
- [ ] T005 Add `leadKey(fips, requestIdentifier)` and `isNotInCurrentRun(sourceManifestCid, currentManifestCid)` pure functions to `packages/domain/src/leads.ts`, unit tested in `tests/packages/domain/leads.test.ts` (test written and failing before the implementation)

---

## Group GA: Lead store + tRPC procedures

**Goal**: FR-001, FR-002, FR-003 (AC-1, AC-2, AC-3) — a lead can be created once per property key, its status/notes persist, and 20 concurrent creates resolve to exactly 1 winner.

**Independent test**: Call `leads.create` for a property, confirm the row and its `SIGNALS`/`EVT#0` items exist; call it again for the same key and confirm `ALREADY_EXISTS`; call `leads.updateStatus` + `leads.addNote`, then `leads.get`, and confirm both persisted.

### Tests first (write failing before implementation)

- [ ] T006 [P] [GA] Vitest: `leadRepo.create` writes `LEAD`+`SIGNALS`+`EVT#0` transactionally and rejects a second create for the same `pk` with `ConditionalCheckFailed` — `tests/apps/api/leadRepo.test.ts`
- [ ] T007 [P] [GA] Vitest: `leadRepo.create` under 20 concurrent calls for the same key resolves to exactly 1 success and 19 `ConditionalCheckFailed` (NFR-001) — `tests/apps/api/leadRepo.concurrency.test.ts`
- [ ] T008 [P] [GA] Vitest: `leadRepo.updateStatus`/`addNote` append a gapless `EVT#{sequence}` and update the `LEAD` projection; a write against a stale `eventSequence` is refused, never silently lost — `tests/apps/api/leadRepo.events.test.ts`
- [ ] T009 [P] [GA] Vitest: `leads.create` router input is Zod-validated and maps `ConditionalCheckFailed` to `cause.code: "ALREADY_EXISTS"`; `leads.addNote` rejects text over 4,000 chars (constitution §6) — `tests/apps/api/routers/leads.test.ts`

### Implementation

- [ ] T010 [GA] Finalize the `crm-leads` table (GSI1 pk=`assignee`/sk=`createdAt`, GSI2 pk=`status`/sk=`createdAt`) in the `CrmData` CDK stack, least-privilege `grant*` to the API Lambda — `infra/` (T002's skeleton)
- [ ] T011 [GA] Implement `leadRepo` (`create`, `updateStatus`, `addNote`, `get`, `listByAssignee`, `listByStatus`) using `TransactWriteItems`, condition expressions per data-model.md — `apps/api/src/adapters/leadRepo.ts`
- [ ] T012 [GA] Implement the `leads` tRPC router (`create`, `updateStatus`, `addNote`, `get`) per contracts/leads.md, Zod on every input, no business rule inline — `apps/api/src/routers/leads.ts`
- [ ] T013 [GA] Implement `leads.list`: forward `roofAgeMinYears`/`permitStatus`/`radiusMi` to the existing `LeadIndex`/search port (same path as the map, per research.md); `assignee`/`status`-only queries go through GSI1/GSI2; compute `notInCurrentRun` per lead at read time — extend `apps/api/src/routers/leads.ts`
- [ ] T014 [GA] Register the `leads` router on `AppRouter` — `apps/api/src/routers/index.ts`
- [ ] T015 [GA] Powertools Logger/Tracer/Metrics on the new routes (constitution §8/XIII); no owner-name or PII fields logged

---

## Group GB: Lead list UI + URL-encoded filters

**Goal**: FR-001 (create entry point), FR-004, FR-005 (AC-4, AC-5) — the lead list is paginated, filterable, URL-shareable, and shows "not in Run {n}" instead of stale data; the lead detail view exposes status/assignee/notes/history.

**Independent test**: With `leads.list`/`leads.get` live (Group GA complete or mocked via MSW), apply a filter combination, confirm the URL encodes it and reopening it reproduces the view; open a lead flagged `notInCurrentRun` and confirm the "not in Run {n}" state renders instead of the signals.

### Tests first (write failing before implementation)

- [ ] T016 [P] [GB] Vitest: `leadFilters` URL-state codec round-trips roof-age/permit-status/radius/center through query params, mirroring `Map/ExploreFilters.state.ts`'s pattern — `tests/apps/web/leadFilters.state.test.ts`
- [ ] T017 [P] [GB] React Testing Library: `LeadsList` renders an explicit empty state (no leads, or a filter combination matching zero) rather than an error or infinite spinner (edge case) — `tests/apps/web/LeadsList.test.tsx`
- [ ] T018 [P] [GB] React Testing Library: `LeadDetail` renders `MissingValue`/"not in Run {n}" when `notInCurrentRun` is true, and never renders the signals snapshot as current in that case — `tests/apps/web/LeadDetail.test.tsx`
- [ ] T019 [P] [GB] Playwright (component-level, pre-hosted-deploy smoke): `LeadCreateAction` wired into the existing `PropertyDetail` drawer calls `leads.create` and shows "Already a lead" on `ALREADY_EXISTS` — `tests/apps/web/LeadCreateAction.spec.ts`

### Implementation

- [ ] T020 [GB] `leadFilters.state.ts`: URL-encoded filter state (roof-age min, permit status, radius, center) — `apps/web/src/routes/Leads/leadFilters.state.ts`
- [ ] T021 [GB] `LeadsList.tsx`: paginated list consuming `leads.list` via `packages/api-client`, Atlas tokens only, filter UI reusing the map's existing filter components where shared — `apps/web/src/routes/Leads/LeadsList.tsx`
- [ ] T022 [GB] `LeadDetail.tsx`: status/assignee/notes/history view consuming `leads.get`, `MissingValue` for `notInCurrentRun` — `apps/web/src/routes/Leads/LeadDetail.tsx`
- [ ] T023 [GB] `LeadCreateAction.tsx`: "Create lead" action wired into the existing `PropertyDetail` drawer (B-03) and the candidate list, calling `leads.create`, showing "Already a lead" on `ALREADY_EXISTS` — `apps/web/src/routes/Leads/LeadCreateAction.tsx`, edits to `apps/web/src/routes/Map/PropertyDetail/*`
- [ ] T024 [GB] Register the `Leads` route in the app's router/nav — `apps/web/src/routes/*`, `apps/web/src/components/AppShell/*`

---

## Dependencies & Execution Order

1. Phase 1 (Setup) → Phase 2 (Foundational) — both block Group GA and Group GB.
2. Group GA and Group GB may run in parallel once Phase 2 is done — GB's UI can develop against contracts/mocks while GA lands the real backend, per `/speckit-implement`'s "launch both task groups in one message."
3. Within each group: tests (T006–T009 / T016–T019) before their implementation tasks (T010–T015 / T020–T024).
4. T014 (register router) depends on T012/T013. T023 (wire into existing drawer) depends on T012 (leads.create exists) and touches B-03's existing `PropertyDetail` component — coordinate to avoid clobbering it.

## Parallel execution examples

- Within Group GA: T006, T007, T008, T009 in parallel (different test files); then T010 before T011; T011 before T012/T013; T012/T013 before T014.
- Within Group GB: T016, T017, T018, T019 in parallel; then T020 before T021; T021/T022 before T023/T024.
- Across groups: Group GA and Group GB can be delegated to two `metagross` builder subagents in the same `/speckit-implement` message.

## Implementation strategy

MVP = Group GA alone (AC-1/AC-2/AC-3, the independent test in stories/B-07-leads.md: "create a lead from a real property, change its status, add a note, reload the page, confirm persistence and no duplicate"). Group GB (AC-4/AC-5) is required for this story's full scope but is independently testable once GA's contracts exist (mockable via MSW against contracts/leads.md in the interim).

---

## Phase Z: Prove on the hosted runtime (deferred to Phase D of this story's walkthrough)

Not run by `/speckit-implement` — tracked in `WALKTHROUGH-B-07-leads.md` Phase D (D1 deploy + Playwright e2e, D2 evidence) instead, per this story's light-lane session plan.
