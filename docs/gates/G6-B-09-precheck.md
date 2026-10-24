---
gate: G6
artifact: testplans/B-09-test-cases.md
artifact_version: "0.1, with the fixes applied in this precheck pass (TC-025b added, automation mapping/assumption notes corrected)"
run_date: 2026-10-24
tool: Claude
verdict: FAIL
---

| # | Check | Result | Finding |
| --- | --- | --- | --- |
| C-01 | AC coverage | PASS | Every AC-1…AC-8 has ≥1 TC (§2 Requirement mapping): AC-1→TC-001/002/003, AC-2→TC-004/005/006, AC-3→TC-007/008, AC-4→TC-009…015/NF-01, AC-5→TC-016/017/NF-02, AC-6→TC-018/019, AC-7→TC-020/021, AC-8→TC-022/023. |
| C-02 | FR coverage | PASS | Every FR-001…FR-008 has ≥1 TC, same mapping as C-01 (each AC maps 1:1 to its FR in `spec.md`). |
| C-03 | Path coverage | PASS | Happy (TC-001, TC-004), negative (TC-007, TC-025, TC-025b, TC-026, TC-027), edge (TC-019b, TC-023b, TC-024, TC-025, TC-025b), missing-data (TC-007/008's "zero fabricated results," TC-010's "contractor not available"/"BBB rating not available") are all present. |
| C-04 | NFR tests | PASS | NFR-001 (≤3 model calls, 5/min, $3/day, 23s abort) has measurable-threshold TCs: TC-024 (23s abort), TC-026 (6th ask throttled), TC-027 (spend cap paused pre-call), TC-NF-01 (p95<20s across golden queries). |
| C-05 | Complete steps | PASS (after fix) | **Finding (resolved):** the first draft's API/Infra/Docs-typed cases (TC-005, TC-009–015, TC-018–023, TC-026, TC-027) don't literally "open the hosted URL in a private window" as step 1 — they're automated/infra/doc checks, not browser journeys. Added an explicit rule to §3 Assumptions ("Login") stating what "opening the hosted URL" means for each non-UI `Type` value (API: authenticated call against the deployed API; Infra: CDK-assertion or CloudWatch check; Docs: reviewed-document check), so every case's steps are unambiguous without forcing a browser step onto a Vitest/CDK check. |
| C-06 | Exact expectations | PASS | Every negative/missing-data case states a concrete outcome (`outcome: "out_of_scope"`, `outcome: "not_found"`, `outcome: "needs_clarification"`, `outcome: "rate_limited"`, `outcome: "paused"`, exact citation/result counts) — no "should work"/"test passes" language found. |
| C-07 | Real test data | **FAIL** | § 5 Test data uses `{P_...}`/`{PM_REAL}` placeholder tokens for the Run-1-manifest records, explicitly marked "to be filled in once this manifest is live" — because it isn't live yet (US4/T020–T023, the data switch, hasn't been implemented or deployed). This is an honest, documented gap, not an oversight: filling these tokens with invented values now would violate the constitution's data-honesty rule (no synthetic data presented as real). **It cannot fully PASS before US4 deploys**, by design — the test cases are drafted from the story's ACs now (per XXII, independent of tasks.md's build order), but the concrete record values are an execution-time fill-in, same category of gap this repo has previously accepted at G7 ("approved with exceptions," `be3c337`). Fix: before running this suite (Phase Z/TZ03), replace every `{P_...}`/`{PM_REAL}` token with a real record read from the deployed Run 1 index, and record the exact values back into this file. |
| C-08 | Independence | PASS | Drafted by reading only `stories/B-09-agent-hardening.md` and `specs/009-agent-hardening/spec.md`; `tasks.md` was not read for this draft (confirmed — this session wrote `tasks.md` earlier and deliberately did not reopen it while drafting test cases). |
| C-09 | Automation mapping | PASS (after fix) | **Finding (resolved):** several P1/P2 Infra/Docs cases (TC-018, TC-019, TC-019b, TC-021, TC-022, TC-023, TC-023b) originally said only "manual" or "manual review" with no automated backing named, where C-09 expects the test named. Updated each: where a CDK-assertion test exists (`infra/test/crm-sync-stack.alarmEmail.test.ts`, `infra/test/crm-ops-stack.dashboard.test.ts`), it's now named as the backing for the *construct's* correctness, with the *live* alarm transition explicitly still manual (a CDK test can't trigger a real SQS message); genuinely manual-only checks (documentation/visual-design review) now say "no automated test" explicitly plus who signs off, rather than leaving the cell to imply an untracked gap. |

**Verdict: FAIL, 1 FAIL (C-07).**

## Fix list
1. **Blocking, but expected and sequenced correctly, not a drafting defect:** fill §5's `{P_...}`/
   `{PM_REAL}` placeholder tokens with real values read from the Run 1 manifest once US4 (T020–T023)
   deploys, before this suite is run in Phase Z/TZ03. This is normal — these test cases are
   intentionally drafted before the data switch exists, per constitution XXII (from the ACs, not
   from the build), and the data-honesty rule (XI) forbids fabricating the values now instead.
2. Already applied in this pass, not deferred: added TC-025b (the missing 0.80–0.92 clarify-band
   edge case — the first draft only covered the <0.80 refuse band, leaving ADR-06's other band
   untested); corrected §3's Login assumption for non-UI case types; corrected the automation
   mapping for 7 Infra/Docs cases.

This gate cannot PASS today without either (a) deploying US4 first and filling the tokens, or
(b) the user explicitly approving G6 with this one documented exception, the same way G7 was
approved with exceptions for B-07 (`be3c337`). Recording that choice is yours, not mine, to make.
Add this gate's row to `docs/traceability.md` once you decide.
