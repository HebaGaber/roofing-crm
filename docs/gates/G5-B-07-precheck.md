---
gate: G5
artifact: specs/007-leads/plan.md, specs/007-leads/tasks.md
artifact_version: dcfdaf2 (B-07: tasks)
run_date: 2026-10-24
tool: Claude
verdict: FAIL
---

# Gate G5 pre-check: B-07 Tasks + Low-Level Design

This is an AI pre-check. It reports gaps only. The user records the gate decision.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Clarified | PASS | No `[NEEDS CLARIFICATION]` in spec.md (grep clean). run-log.md records `/speckit-clarify` done (A3) and Round 1 decisions D-1, D-2. |
| C-02 | Phase structure | FAIL | tasks.md has Setup, Foundational, Group GA, Group GB, Phase Z. There are no story phases (P1 → P2 → P3) and no Polish phase. The header says the stories are "not" the organising unit, so the required structure is replaced by two groups. |
| C-03 | Task format | FAIL | Format and [P] are used. Story links are missing: groups [GA]/[GB] are used, not story references. Exact paths are missing or not exact: T001 (command only), T015 (no path), T002 and T010 (`infra/`, a directory), T024 (`apps/web/src/routes/*`, `apps/web/src/components/AppShell/*`, globs). T004 is marked [P] but depends on T003. |
| C-04 | Tests first | FAIL | Tests precede implementation for the create/dedupe, repo, and UI-filter tasks (T006–T009, T016–T019). Some implemented tasks have no test task at all: `leads.list` (T013), `leads.get` and `leads.updateStatus`/`addNote` at router level (T012), and Powertools (T015). |
| C-05 | Live verification last | FAIL | tasks.md has no TZ01–TZ06. "Phase Z" is a one-line pointer to `WALKTHROUGH-B-07-leads.md` Phase D, which is not in the repo. |
| C-06 | LLD complete | PASS | plan.md covers components (source tree), data flow (create transaction, list filter path in Technical Context), integration points (LeadIndex port, B-03 drawer, Cognito), and test approach. Data flow is brief in plan.md; contracts/leads.md and data-model.md carry the detail. |
| C-07 | Architecture conformance | FAIL | (a) ARCH §4/§9 place use cases in `apps/api/src/services/*` behind injected ports (`LeadRepo`). The plan has the router call `leadRepo` directly, with no service layer and no port, and this is not flagged as a deviation. (b) ADR-04 says status/assignee is "a projection replayed from events". research.md updates the projection at write time instead. It argues this is compatible but does not record it as a deviation. (c) Plan puts the URL codec in `packages/domain/src/leadFilters.ts`, but T016/T020 put it in `apps/web/src/routes/Leads/leadFilters.state.ts`. |
| C-08 | Kit usage | PASS | agent-design.md holds verbatim answers from `mew` and `metagross`. plan.md has a filled Kit Agent Ownership table citing it, the builder's skills, and the required patterns. Not verified: `use-neutral-lexicon` (listed in the skills) did not show up in the available skill list. Check that it is bundled. |
| C-09 | Coverage | PASS | FR-001 to FR-005 and NFR-001 each map to at least one task (e.g. FR-002 → T006/T007/T011; FR-004 → T013/T016/T020/T021; FR-005 → T013/T018/T022). Gap, not a failure: no task checks the "list count = map count" parity or the 2 s target. |
| C-10 | Analyze | FAIL | run-log.md says `/speckit-analyze` (self-run) reported 0 CRITICAL/HIGH. No analyze report is saved in specs/007-leads/. The finding in C-07(c) and the phase/Phase Z gaps above should have been reported. Re-run analyze, save its output, and treat C-02, C-05 and C-07 as HIGH. |

**Verdict: FAIL** (6 of 10 checks fail: C-02, C-03, C-04, C-05, C-07, C-10).

## Fix list (by impact on the assessment score)

1. **C-05**: add TZ01–TZ06 to tasks.md (reviewer agents `metagross` + `audino` score, deploy, Playwright on RUNTIME_URL, smeargle on 390/768/1440, agents.verify check, evidence + traceability + kit usage).
2. **C-07(c)**: pick one location for the URL codec (`packages/domain/src/leadFilters.ts` per plan), and update T016 and T020 to match.
3. **C-07(a) and (b)**: add an `apps/api/src/services/leads` use-case layer with a `LeadRepo` port, or record in plan.md's Constitution Check why it is skipped. Record the ADR-04 projection choice as an explicit deviation with justification.
4. **C-02**: restructure tasks.md into Setup → Foundational → story phases (US1–US4 or the two groups mapped to ACs) → Polish, or record the deviation in the Constitution Check.
5. **C-04**: add test tasks before T012 (get/updateStatus/addNote router), T013 (list), and T015 (logging assertions where practical).
6. **C-03**: add story/AC links and exact file paths to T001, T002, T010, T015, T024; drop [P] from T004.
7. **C-10**: re-run `/speckit-analyze` after the fixes above and save the output to specs/007-leads/.
8. Confirm `use-neutral-lexicon` is a bundled kit skill (C-08).

Offer: apply fixes 1–7 to the artifacts, but only with the user's agreement. Gate decision and gate-log row are the user's.
