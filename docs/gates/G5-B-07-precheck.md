---
gate: G5
artifact: specs/007-leads/plan.md, specs/007-leads/tasks.md
artifact_version: 2dcf72e (plus uncommitted edits to plan.md and tasks.md, second run)
run_date: 2026-10-24
tool: Claude
verdict: FAIL
---

# Gate G5 pre-check: B-07 Tasks + Low-Level Design (run 2)

This is an AI pre-check. It reports gaps only. The user records the gate decision.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Clarified | PASS | No `[NEEDS CLARIFICATION]` in spec.md. run-log.md records `/speckit-clarify` (A3) and Round 1 decisions D-1, D-2. |
| C-02 | Phase structure | FAIL | tasks.md line 8 states "grouped into exactly two task groups (not by the spec's four user stories)". Phases are Setup, Foundational, Group GA, Group GB, Polish, Phase Z. There are no P1 and P2 story phases, and the "Dependencies" section says GA and GB may run in parallel. GB contains P2 work (US3/US4, T019–T025) alongside P1 work (T026, US1 entry point). |
| C-03 | Task format | FAIL | No exact file path on T001 (command only), T027 ("`apps/web/src/routes/index.tsx` (or the app's existing router file)"), T028 (directory list), T029 (no target file), TZ01, TZ02, TZ04, TZ05. Setup, Foundational and Polish tasks (T001–T005, T028–T030) have no story/FR link. GA/GB tasks link only through the group header, not per task. |
| C-04 | Tests first | PASS | T006–T011 (GA) precede T012–T018. T019–T022 (GB) precede T023–T027. Tests exist for create, updateStatus, addNote, get and list (T008, T010, T011). Note: T005 contains its own test inline ("written and failing before the implementation"); splitting it into a separate test task would make the ordering explicit. |
| C-05 | Live verification last | PASS | Phase Z (TZ01–TZ06) is last. It covers reviewers (TZ01), deploy (TZ02), Playwright on the preview URL (TZ03), smeargle at 390/768/1440 (TZ04), agents.verify (TZ05), evidence, traceability and kit-usage (TZ06). Note: TZ03 says "preview URL" and does not name RUNTIME_URL or exclude localhost; reword to make this explicit. |
| C-06 | LLD complete | PASS | Components, layers, integration points (LeadIndex port, Cognito authorizer, PropertyDetail drawer) and test approach are documented. Data flow is stated as the layer chain plus the DynamoDB/DuckDB storage split, with no explicit request sequence. |
| C-07 | Architecture conformance | FAIL | (a) The ADR-04 projection deviation is flagged in Complexity Tracking, but it cites "mew's design consult ... explicitly allows this". mew's answer (agent-design.md B1) says "Confirmed, no change needed" and describes status/assignee as "a projection replayed from events". The "either is fine, not both independently" wording is metagross's (B2). (b) The deviation is not in architecture-constitution.md §13 Accepted deviations, and has no PO approval as §14 requires for P1 drift. (c) Application-layer ports: §4 says services receive `LeadRepo` as an injected port. T014 calls `leadRepo` directly, with no injection. Service layer (apps/api/src/services/leads.ts) and URL-codec location are now consistent. |
| C-08 | Kit usage | PASS | agent-design.md has verbatim answers from mew (B1) and metagross (B2). plan.md has a filled Kit Agent Ownership table citing both, names the builder skills (build-frontend-backends, use-neutral-lexicon, frontend-bug-fix, apply-engineering-guidelines) and lists the builder patterns. |
| C-09 | Coverage | PASS | FR-001 to FR-005 each map to at least one task (analysis-report.md coverage table; checked against tasks.md). |
| C-10 | Analyze | PASS | analysis-report.md exists. It reports 0 CRITICAL and 0 HIGH findings (two MEDIUM, M1 and M2). |

**Verdict: FAIL (3 FAIL, 7 PASS).**

## Fix list (by impact on the assessment score)

1. **C-07 (ADR-04 deviation).** Either implement full projection replay from `EVT#` items as ADR-04 states, or record the deviation in architecture-constitution.md §13 with the PO's approval. Correct the Complexity Tracking row to cite metagross's B2 consult (not mew's B1). Inject `LeadRepo` into `leadService` per §4.
2. **C-02 (phase structure).** Re-phase tasks.md into Phase 3 (P1: US1 and US2, covering FR-001 to FR-003) and Phase 4 (P2: US3 and US4, covering FR-004 and FR-005). Keep the two-group split only as a sub-label inside each phase. Make P2 depend on P1.
3. **C-03 (paths and links).** Give T001, T028, T029 and TZ01, TZ02, TZ04, TZ05 exact file paths. Replace T027's "or the app's existing router file" with the exact file. Add a story/FR link to every Setup, Foundational and Polish task.

Optional (does not change the verdict): name RUNTIME_URL explicitly in TZ03; split T005 into a test task and an implementation task.

When the fixes are in, re-run this pre-check. The user records the gate decision. I do not approve.
