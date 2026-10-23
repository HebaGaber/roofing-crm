---
gate: G5
artifact: specs/007-leads/plan.md, specs/007-leads/tasks.md
artifact_version: 2dcf72e (plus uncommitted edits to plan.md, research.md and tasks.md, third run)
run_date: 2026-10-24
tool: Claude
verdict: FAIL
---

# Gate G5 pre-check: B-07 Tasks + Low-Level Design (run 3)

This is an AI pre-check. It reports gaps only. The user records the gate decision.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Clarified | PASS | No `[NEEDS CLARIFICATION]` in spec.md. run-log.md records `/speckit-clarify` (A3) and Round 1 decisions D-1 and D-2. |
| C-02 | Phase structure | FAIL (accepted exception) | tasks.md has Setup, Foundational, Group GA, Group GB, Polish and Phase Z. There are no P1 or P2 story phases. The two-group split is directed by `../assessment-guide/WALKTHROUGH-B-07-leads.md` (line 18 and line 181: "exactly two groups"). It is documented in tasks.md's Organization note. Treated as an accepted, explicitly instructed exception, not a defect. It does not clear the strict criterion. |
| C-03 | Task format | FAIL | Paths are now present or explicitly marked (T001, T028, T029 are verification or no-file tasks). Two gaps remain. (a) No story or FR link on the task line for T002, T003, T004, T005, T028, T029, T030 or TZ01–TZ06. The `[GA]`/`[GB]` labels are group labels, not story links. The round-2 fix did not add these. (b) TZ05 names no file path and no "no file change" label. It only says "is the same suite as TZ03". Fix: add `FR-00x` links to each of these tasks, and write `No file change — verification only: tests/e2e/B-07.spec.ts (TZ03 suite)` on TZ05. |
| C-04 | Tests first | PASS | T006–T011 precede T012–T018. T019–T022 precede T023–T027. Note: T005 bundles its own test with its implementation ("test written and failing before the implementation"). Splitting it into a test task and an implementation task would make the ordering explicit. |
| C-05 | Live verification last | PASS | Phase Z (TZ01–TZ06) is last. TZ03 now names `RUNTIME_URL` and excludes localhost. TZ01 covers reviewers, TZ02 deploy, TZ03 Playwright, TZ04 smeargle at 390/768/1440, TZ05 agents.verify, TZ06 evidence and traceability. |
| C-06 | LLD complete | PASS | plan.md documents components (routers, services, adapters, domain, UI), layers, integration points (LeadIndex port, Cognito authorizer, PropertyDetail drawer), data flow as the layer chain plus the DynamoDB/DuckDB split, and the test approach. |
| C-07 | Architecture conformance | FAIL | (a) `architecture-constitution.md` §4: "Services receive `LeadRepo` ... as injected ports". plan.md line 45 and T014 say only that the service "orchestrates `leadRepo`" or "calls `leadRepo`". Injection is not stated. (b) ADR-04 says status/assignee are "a projection replayed from events". The plan stores them on the `LEAD` item, written in the same transaction as the event. The deviation is justified and flagged in plan.md Complexity Tracking. It is not in §13 "Accepted deviations" and has no PO approval, which §13 requires and §14 makes a blocker for G7 (P1 drift). The round-2 citation fix is correct and does not change this. |
| C-08 | Kit usage | PASS | agent-design.md has verbatim answers from mew (B1) and metagross (B2). plan.md has a filled Kit Agent Ownership table citing both, names the builder skills (`build-frontend-backends`, `use-neutral-lexicon`, `frontend-bug-fix`, `apply-engineering-guidelines`) and lists the builder patterns. |
| C-09 | Coverage | PASS | FR-001 to FR-005 each map to at least one task: T013–T017 and T026 (FR-001); T006, T007, T013–T015 (FR-002); T008, T009, T013–T015, T025 (FR-003); T011, T016, T019, T023, T024 (FR-004); T005, T016, T021, T025 (FR-005). |
| C-10 | Analyze | PASS | analysis-report.md reports 0 CRITICAL and 0 HIGH findings (M1, M2 MEDIUM; L1, L2 LOW). It predates the round-2 and round-3 edits to tasks.md and plan.md. Re-run `/speckit-analyze` after the fixes below. |

**Verdict: FAIL.** Three checks fail: C-02 (accepted exception, see above), C-03 and C-07. C-02 alone would not block G5. C-03 and C-07 must be fixed before G5 can clear.

## Fix list (by impact on the assessment score)

1. **C-07(b), ADR-04 projection deviation.** Either implement replay from `EVT#` items as ADR-04 states, or add a row to `architecture-constitution.md` §13 with the PO's approval. Under §14 this is a G7 blocker until one of the two is done.
2. **C-07(a), port injection.** Change plan.md line 45 and T014 to state that `leadService` receives `LeadRepo` as an injected port (constructor parameter), per §4.
3. **C-03(a), story links.** Add an `FR-00x` or story link to T002–T005, T028–T030 and TZ01–TZ06.
4. **C-03(b), TZ05 path.** Label TZ05 "No file change — verification only" and name `tests/e2e/B-07.spec.ts` as its target.
5. **C-10, re-analyze.** Re-run `/speckit-analyze` so `analysis-report.md` reflects the current tasks.md.
6. **C-04 (optional).** Split T005 into a test task and an implementation task.
7. **C-02 (accepted).** No change needed. Keep the Organization note as the record of the walkthrough instruction.

When the fixes are in, re-run this pre-check. The user records the gate decision. I do not approve.
