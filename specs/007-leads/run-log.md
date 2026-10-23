# B-07 run log

- {A1} B-03 merge confirmed (`80873e1 B-03: merge map search (G7 PASS)`); git tree clean except untracked stories/B-07-leads.md, stories/B-09-agent-hardening.md.
- {A2} Haiku G4 pre-check: FAIL, 2 content gaps (NFR-001 trace missing AC; prototype paths pointed at non-existent design/screens/ files). Fixed directly (wording/path only, no AC meaning change): NFR-001 now traces to AC-2, screen paths corrected to design/prototype/*.dc.html (CrmLeadDup390/1440, not CrmPropertyDup390). Ticked all G4 boxes, testable boxes, status Draft→Ready, qc_testability_signoff true, Decision Ready 2026-10-24.
- {A3} Branch 007-leads created off feature/roofing-crm. /speckit-specify: spec.md written (FR-001..005 <-> AC-1..5), quality checklist all pass. Committed c5f43d4.
- {A3} /speckit-clarify: scanned taxonomy, no critical ambiguities — all answered by story/ADR-04/§5 facts except GSI naming and "not in Run {n}" timing, both deliberately deferred to Round 1. Proceeding to Round 1.
- {R1} Round 1 decisions, both recommended answers accepted: D-1 GSI naming left to mew/metagross design consults; D-2 "not in Run {n}" computed at read time (compare lead's sourceManifestCid against current META#index pointer), no scheduled job.
- {B1} mew design consult (Sonnet): confirmed lead key + gapless event model, no change needed; flagged no mutable staleness field required. Saved to specs/007-leads/agent-design.md.
- {B2} metagross design consult (Sonnet): proposed crm-leads table (pk/sk, EVT# events, SIGNALS snapshot), GSI1=assignee/GSI2=status, tRPC procedures, URL-filter UI with Atlas components. No disagreement with mew. Appended to agent-design.md.
- {B3} /speckit-plan, /speckit-tasks (2 groups GA/GB, tests-first), /speckit-analyze (self-run): 0 CRITICAL/HIGH, 2 MEDIUM already mitigated by phasing, 100% FR coverage. Launched G5 (plan/tasks) + G6 (test cases, drafting testplans/B-07-test-cases.md first) Haiku pre-checks in parallel — pending.
