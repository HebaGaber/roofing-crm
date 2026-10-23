---
gate: G5
artifact: specs/007-leads/plan.md, specs/007-leads/tasks.md
artifact_version: 5336f14
run_date: 2026-10-24
tool: Claude
verdict: FAIL
---

# Gate G5 pre-check: B-07 Create, manage and browse CRM leads (fourth run)

| Check | Result | Finding |
| --- | --- | --- |
| C-01 Clarified | PASS | No `[NEEDS CLARIFICATION]` in spec.md. speckit-clarify logged in run-log.md ({A3}). |
| C-02 Phase structure | PASS (accepted exception) | Setup, Foundational, GA/GB, Polish, Phase Z. Two-group split is the walkthrough-directed exception, as confirmed by the user. |
| C-03 Task format | FAIL | Labels: Setup, Foundational, Polish and Phase Z tasks carry no story label, per the speckit-tasks Task Generation Rules (`.claude/skills/speckit-tasks/SKILL.md` lines 162-165). GA/GB tasks carry their group label, which the group Goal line maps to FR-001..005. Exact paths: T014 reads "`apps/api/src/leadIndex.ts` or the handler file that calls it (edit)", which is not one exact file. Non-blocking: T001, T028 and TZ05 name no file (T001 and T028 are explicitly "no file change"). |
| C-04 Tests first | PASS | T006-T011 precede T012-T018. T019-T022 precede T023-T027. T005 states its test must fail before its implementation. |
| C-05 Live verification last | PASS | TZ01 (metagross, audino reviewers), TZ02 (deploy), TZ03 (Playwright on RUNTIME_URL), TZ04 (smeargle at 390/768/1440), TZ05 (agents.verify), TZ06 (evidence, traceability, kit-usage). |
| C-06 LLD complete | PASS | plan.md has the file-level structure, the layers, the integration points (LeadIndex, PropertyDetail drawer, AppRouter, Cognito), and the test approach. |
| C-07 Architecture conformance | PASS | LeadRepo is an injected port: `createLeadService(leadRepo: LeadRepo)`, wired in `createContext` (T014). ADR-04 deviation is in architecture-constitution.md §13 (PO, 2026-10-24) and referenced from plan.md Complexity Tracking. Note: §4 lists URL-state under the Entry row (apps/web), which supports the codec's placement in apps/web. |
| C-08 Kit usage | PASS | agent-design.md has verbatim answers for `mew` and `metagross`, which are the agents.design agents. plan.md has the Kit Agent Ownership table, the builder's skills (all four exist in the kit, including use-neutral-lexicon), and the builder patterns. |
| C-09 Coverage | PASS | FR-001..FR-005 each have at least one task (analysis-report.md coverage table, verified). |
| C-10 Analyze | PASS | analysis-report.md: 0 CRITICAL, 0 HIGH (2 MEDIUM, mitigated). Self-run analysis, so a fresh speckit-analyze pass would strengthen this. |

## Fix list (by impact on score)

1. **C-03 (blocks G5):** In tasks.md T014, replace "`apps/api/src/leadIndex.ts` or the handler file that calls it (edit)" with the single exact handler file that builds `createContext`.
2. **C-03 (non-blocking):** Add an explicit file or "no file change" note to TZ05. Optionally, add a file to T001 and T028 (for example, the run-log).
3. **C-10 (non-blocking):** Re-run speckit-analyze after fix 1 so the report reflects the final tasks.md.

**G5 does not clear.** Fix 1 is a one-line change. After it, the verdict should be PASS, pending the user's decision.
