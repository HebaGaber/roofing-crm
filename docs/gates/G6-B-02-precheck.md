---
gate: G6
artifact: testplans/B-02-test-cases.md
artifact_version: 0.1
run_date: 2026-10-23
tool: Claude
verdict: FAIL
---

# Gate G6 pre-check: B-02 Test Case Approval

Inputs read: `testplans/B-02-test-cases.md`, `stories/B-02-lead-index.md`, `specs/002-lead-index/spec.md`, `.specify/memory/constitution.md` (Articles XXI-XXII).

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | AC coverage | PASS | §2 maps AC-1 to TC-001..003, AC-2 to TC-004/005, AC-3 to TC-006/007, AC-4 to TC-008/009. |
| C-02 | FR coverage | PASS | §2 and §7 map FR-001 to FR-004 to at least one TC each. |
| C-03 | Path coverage | PASS | Happy (001, 002, 008), negative (003, 009, 010, 011, 012), edge (011, 012), missing-data (006, 007). |
| C-04 | NFR tests | FAIL | NFR-001 has only a matrix row (TC-NF-01) with no steps or expected result in §8. §2 maps NFR-002 to TC-NF-02, but TC-NF-02 tests the ARD-B cold-load of 3 s, not NFR-002. TC-010 does not assert the concurrency-2 part of NFR-002. Fix: add full bodies for TC-NF-01 and TC-NF-02 with pass thresholds (5 min, 3 s); correct the §2 row for NFR-002 to TC-010; add "concurrency ≤ 2 per gateway" to TC-010's expected result. |
| C-05 | Complete steps | FAIL | Cases start from triggering the Step Functions execution, not from the hosted runtime `crm.aldarraj.com` named in the front matter. The adaptation appears only in §3 and the G6 table. Several steps are not exact: TC-006 "a parcel near Del Valle" (no property CID); TC-002 step 2 combines two queries; TC-008 step 1 lists two S3 prefixes in one step; TC-003 "Simulate the CloudFront CID copy returning a connection abort" has no fault-injection method. Fix: add a Target line to each case ("deployed crm-sync, eu-north-1; hosted runtime for this UI-less story"), split multi-action steps, and name the exact property CID and fault-injection method. |
| C-06 | Exact expectations | FAIL | TC-011 expects "a CloudWatch alarm fires" with no alarm name, and "the previous index still serves" with no manifestCid value. TC-005 expects "a disagreement is investigated" (not an observable result). Fix: name the alarm (e.g. `crm-sync-dlq-alarm`) and the expected `manifestCid` value in TC-011; replace TC-005's expectation with "counts differ → evidence row written in docs/evidence/B-02.md with status Open". |
| C-07 | Real test data | FAIL | Manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` is named and appears in repo docs, so the snapshot is named. However, TC-006 and TC-007 rely on "a parcel near Del Valle" and §5 names no property record. Fix: name the real published property CID for the Del Valle no-permit parcel in §5 and use it in TC-006. |
| C-08 | Independence | PASS | Cases derive from the ACs and FRs. `tasks.md` contains no test-case references (only T037 mentions vitest). |
| C-09 | Automation mapping | FAIL | P1/P2 cases map to Vitest files or manual steps, not Playwright: TC-002, 006, 007, 008, 010, 011, 012 (Vitest); TC-005, 009, NF-01, NF-02 (manual). Only TC-001, 003, 004 name Playwright (`tests/e2e/*.spec.ts`). Fix: either name a Playwright spec per P1/P2 case that runs against the deployed endpoints, or record in §7 a documented exception for UI-less stories and get the user's ratification. |

**Fix list (by impact on assessment score)**

1. C-09: decide the runner for UI-less cases and map every P1/P2 case to it (or record a ratified exception).
2. C-05 and C-07: add the hosted target to every case and name the real Del Valle property CID.
3. C-04: write TC-NF-01 and TC-NF-02 in full, correct the NFR-002 mapping, and add concurrency 2 to TC-010.
4. C-06: name the alarm and the expected manifestCid in TC-011; make TC-005's expectation observable.

**Verdict: FAIL (5 of 9 checks failed).** This pre-check does not approve the gate. The user records the decision. No changes were made to the test-case file.
