---
gate: G6
artifact: testplans/B-02-test-cases.md
artifact_version: 0.1
run_date: 2026-10-23
tool: Claude
verdict: FAIL
---

# Gate G6 pre-check (third run): B-02 Test Case Approval

Inputs read: `testplans/B-02-test-cases.md` (current text, read fresh), `stories/B-02-lead-index.md` (ACs, edge cases, NFR-001/NFR-002), `specs/002-lead-index/spec.md` (FR-001..FR-004, SC-001..SC-006), the `developmentsupport-g6-precheck` skill criteria C-01..C-09, `infra/lib/crm-sync-stack.ts` (alarm name, Map concurrency), and the Playwright specs' header comments in `tests/e2e/`. The test plan's own §11 run results were used only to check its expectations for consistency.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | AC coverage | PASS | §2 maps AC-1 to TC-001/002/003, AC-2 to TC-004/005, AC-3 to TC-006/007, AC-4 to TC-008/009. |
| C-02 | FR coverage | PASS | §2 and §7 map FR-001 to FR-004 to at least one TC each. |
| C-03 | Path coverage | PASS | Happy (TC-001, 002, 008), negative (TC-003, 010, 011, 012), edge (TC-009, 011, 012), missing-data (TC-006, 007). |
| C-04 | NFR tests | FAIL | Three gaps. (a) NFR-002 says "concurrency 2" (story text), but TC-010 step 1 and its expected result assert Distributed Map `MaxConcurrency = 3` (matching `FETCH_PART_MAP_CONCURRENCY = 3` in `infra/lib/crm-sync-stack.ts`). The test checks a number the NFR does not state, and it never asserts per-gateway concurrency ≤ 2. (b) NFR-001 has two thresholds (≤ 5 min for an A-03-sized run, ≤ 30 min for the full county, story and spec SC-005). TC-NF-01 covers only the 5-minute sample case. The 30-minute full-county threshold has no TC and no §10 row. (c) §2 NFR-002 mapping and TC-NF-02 mapping are now correct (fixed). |
| C-05 | Complete steps | FAIL | Fixed: every case has a `Target:` line (14 of 14), fault-injection methods are named (TC-003, TC-010, TC-011), and TC-011 names the alarm. Still open: (a) Not every case starts from a hosted target. TC-003, TC-006, TC-007, TC-010, TC-011, TC-012 are Vitest unit tests on mocks or fixtures (their own text says "not production traffic", "fixture, not a real Task A republish", "a fixture row"). They never open the deployed `crm-sync` execution or API Lambda. §6 says every P1/P2 case is a Vitest test "against the deployed Step Functions execution and API Lambda", which the case bodies contradict. (b) Multi-action steps remain: TC-002 step 2 and 3 each query and record two things; TC-008 step 1 lists two S3 prefixes; TC-010 step 3 verifies backoff and the token-bucket cap in one step; TC-011 step 2 verifies two state checks in one step; TC-006 step 2 verifies two fields. |
| C-06 | Exact expectations | FAIL | Fixed: TC-011 names `crm-sync-fetch-part-dlq-depth` (matches `alarmName` in `infra/lib/crm-sync-stack.ts`). Still open: (a) TC-009 expected result says "fails with an execution-already-exists error". The exact Step Functions error name is `ExecutionAlreadyExists`; the text must state it. (b) TC-002's expected result says "35 total rows expected across both queries". TC-004's own §11 evidence records `propertyCount: 14`, and §3 describes 35 as the permit-row count. The expectation is ambiguous or wrong. State the count per query (for example, properties 14, permits 35) and match §11. |
| C-07 | Real test data | FAIL | Manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` is named in §3, §5 and the cases. Still open: §5 says the fixture is "drawn from the sample manifest's real published rows, not invented", but §3 says the sample has zero `roof_age_basis = "unknown"` rows. The fixture is therefore invented, and the text contradicts itself. §5 also names no property CID (only "a parcel near Del Valle"). TC-006 step 1 takes "the first result's `propertyCid`" at run time. Fix: either name a real published property CID from the sample with its real `roof_age_basis`, or label the fixture explicitly as synthetic test data (not "real") and move it out of the "real records" criterion G6-6. |
| C-08 | Independence | PASS | Cases derive from the story ACs and spec FRs. `specs/002-lead-index/tasks.md` has no TC references. |
| C-09 | Automation mapping | FAIL | Four issues. (a) Only TC-001, TC-003 and TC-004 name a Playwright spec. The four specs they point at (`manifest.spec.ts`, `fallback.spec.ts`, `cid-copy.spec.ts`, `verify-manifest.spec.ts`) all carry the header `// OUT OF SCOPE FOR B-02 (decided 2026-10-23...)`. The same header says their fixture opens Oracle's `/runs` page, which B-02 does not have. The references therefore point at specs the repo says are not B-02's. This is the pending item from the concurrent fix: the headers are the current state, and I could not confirm the files will change. (b) None of the named test titles (`"B-02-TC-001"`, etc.) appears in any file under `tests/e2e/`, `apps/*/test/` or `packages/config/test/`. The files named exist, but the titles do not. (c) TC-003's Playwright reference (`fallback.spec.ts`) conflicts with its own fault-injection text (a Vitest-mocked `fetcher.fetch`). (d) P1/P2 cases with no automation at all: TC-005 (P1, manual + MCP), TC-009 (P2), TC-NF-01 (P2), TC-NF-02 (P2). The UI-less exception in §6 still has no recorded ratification. G6-8 and the Decision line are unticked, and §6's phrase "per the QC Lead's (user's) ratification at G6 approval" describes an approval that has not happened. |

## Fix list (ordered by impact on the assessment score)

1. **C-09:** Resolve the Playwright references. Either retarget TC-001/003/004 to specs that are in B-02 scope, or drop the Playwright claim. Add the actual test titles `B-02-TC-nnn` to each named file. Record the user's ratification of the Vitest-as-proof convention in §6 with name and date, and add automation for TC-005, TC-009, TC-NF-01 and TC-NF-02 (or state their manual steps as the recorded automation).
2. **C-05 (hosted start):** Decide whether mocked Vitest cases count as runtime proof. The skill's C-05 says no. If the user ratifies them as an exception (as with C-09), record it once in §6 and keep the rule that each TC names its real target. Either way, §6's sentence "against the deployed Step Functions execution and API Lambda" must match the Target lines.
3. **C-07:** Name a real Del Valle property CID from the sample, or label the fixture as synthetic. Delete "drawn from the sample manifest's real published rows, not invented" if the row is not real.
4. **C-04:** Change TC-010's Map concurrency expectation to match NFR-002 (concurrency 2 per gateway), or amend the story's NFR-002 wording to say "Map MaxConcurrency 3, per-gateway 2" and cite the source. Add a TC (or §10 row) for the NFR-001 full-county 30-minute threshold.
5. **C-06:** Replace "execution-already-exists error" in TC-009 with `ExecutionAlreadyExists`. Fix TC-002's count so it matches the per-query figures in §11.
6. **C-05 (steps):** Split TC-002 step 2/3, TC-008 step 1, TC-010 step 3, TC-011 step 2 and TC-006 step 2 into one action each.

## Verdict

**FAIL: 5 of 9 checks failed** (C-04, C-05, C-06, C-07, C-09). C-01, C-02, C-03 and C-08 pass.

The fixes made since the last run are real. The C-06 alarm name, the C-05 Target lines and fault-injection methods, the NFR-002 mapping, and the C-04 TC-NF-02 body are all in place. Four items remain open: the Playwright references (C-09) now point at specs marked out of scope for B-02, the mocked-vs-hosted question (C-05), the invented-vs-real fixture (C-07), and the concurrency and count mismatches (C-04, C-06). The G6-8 box and the Decision line were not ticked, and this pre-check does not approve the gate. The user records the decision. No changes were made to `testplans/B-02-test-cases.md`.
