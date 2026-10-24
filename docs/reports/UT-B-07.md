---
id: UT-B-07
type: unit-test-report
story: B-07
branch: 007-leads
commit: 4ee8e45
ci_run: https://github.com/HebaGaber/roofing-crm/actions/runs/40076720899
created: 2026-10-24
---

# Unit and Integration Test Report: B-07 Create, manage and browse CRM leads

Totals are from the final code (fixes in `2a2f669`, tests-only changes after). The CI workspace job (lint, type-check, unit tests) passed on `2a2f669`: https://github.com/HebaGaber/roofing-crm/actions/runs/40076720899 . The per-package totals below are from a local `pnpm exec turbo run type-check test` run on the same code (28 of 28 tasks); the CI log keeps raw escape codes, so it was not parsed.

| Item | Value |
| --- | --- |
| Command | `pnpm exec turbo run type-check test` (coverage: `pnpm --filter {pkg} run test:coverage`; `test:coverage` is not a turbo task) |
| Suites / tests | 95 test files passed (+1 skipped) / 793 tests passed |
| Passed / failed / skipped | 793 / 0 / 5 (the 5 skipped are inherited, in `@crm/oracle-views`) |
| Lint, format | `eslint .` clean, `prettier --check .` clean |
| Coverage of new and changed code | API lead code 91 to 97 % (met). Web lead screens **below** the 80 % target (see below) |

## By package (this story touched `@crm/api`, `web`, `@crm/domain`, `@crm/sync`)

| Package | Files | Tests | Notes |
| --- | --- | --- | --- |
| `@crm/api` | 19 | 112 | lead repo, service, router, error format, index adapter |
| `web` | 15 | 104 | lead list, detail, create action, filter state |
| `@crm/domain` | 4 | 25 | lead key, `requestIdentifierOf`, AC-5 pre-check |
| `@crm/sync` | 15 | 79 | promote and validate key shape, first-ever promote |
| other packages | 42 | 473 | unchanged by this story |

## Coverage of the lead code

| File | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| `apps/api/src/adapters/leadRepo.ts` | 91.5 % | 69.6 % | 91.2 % | 93.5 % |
| `apps/api/src/services/leads.ts` | 96.7 % | 91.9 % | 100 % | 97.2 % |
| `apps/api/src/routers/leads.ts` | 94 % | 84 % | 100 % | 93.8 % |
| `apps/api/src/trpc.ts` | 93.8 % | 90 % | 100 % | 93.8 % |
| `apps/api/src/adapters/duckDbParquet.ts` | 96.4 % | 85.5 % | 96.9 % | 96.9 % |
| `packages/domain` (all) | 100 % | 85 % | 100 % | 100 % |
| `apps/web/.../LeadDetail.tsx` | 68.2 % | 64.4 % | 60 % | 78.4 % |
| `apps/web/.../LeadsList.tsx` | 53.8 % | 63.2 % | 36.4 % | 57.1 % |
| `apps/web/.../leadsApi.ts` | 0 % | n/a | 0 % | 0 % |

**Below target, stated plainly:** the web lead screens are under 80 %. `leadsApi.ts` (the data hooks) has no unit coverage; the list, detail and create flows are exercised by the 20 hosted e2e cases (`docs/evidence/B-07.md`) instead. `leadRepo.ts` branch coverage (69.6 %) is also under 80 %. Both are listed for the follow-up story.

## Tests written first (TDD)

| Area | Test file | Failed first? | Now |
| --- | --- | --- | --- |
| Lead store, tRPC procedures, list UI (phase C, tasks T006 to T027) | `apps/api/test/**`, `apps/web/test/**` | yes per the run log (builders showed each failing first) | PASS |
| First-ever promote (`if_not_exists`) | `apps/sync/test/promote.test.ts` | yes | PASS |
| Transaction conflict retry (3 tests) | `apps/api/test/leadRepo.conflict.test.ts` | yes (2 of 3 failed; the bounded give-up test passed trivially before) | PASS |
| Newest lead first (2 tests) | `apps/api/test/leadRepo.order.test.ts` | yes | PASS |
| Note shown as typed (3 tests) | `apps/web/test/leads/eventText.test.ts` | yes | PASS |
| Snapshot permit, per-permit button, "Add note" guard | `apps/web/test/leads/*` | yes (web tests seen failing) | PASS |
| Review fixes: filter limit, caller scope, request-id parsing, note trim, partial location filter (9 tests) | `apps/api/test/**`, `packages/domain/test/leads.test.ts` | yes | PASS |
| `META#index` key shape (3 tests: promote, validate, API reader) | `apps/sync/test`, `apps/api/test` | **no**: written after the fix | PASS |
| Error code reaches the browser (`withAppCode`) | `apps/api/test/appCode.test.ts` | **no**: written with the code | PASS |
| Snapshot permit and AC-5 presence (service and adapter tests) | `apps/api/test/services/leads.test.ts`, `query.test.ts` | **no**: written in one pass with the code | PASS |

## Failures and flakes

| Test | Cause | Action |
| --- | --- | --- |
| `duckDbParquet.test.ts` cold-load race (B-02) | Failed on the slower CI machine: a fixed 50 ms sleep before checking that the stale connection closed | Fixed in `1c8d151`: polls up to 3 s. 5 of 5 repeat local runs passed; the CI workspace job passed on `2a2f669` |
| `A-13-vitals.spec.ts` (e2e, not unit) | Oracle spec importing a package and helpers this repo lacks; broke the hosted CI job | Removed in `1c8d151` (see `CR-B-07` finding 5) |
| Web test mocked `error.data.cause.code` | The mock matched a shape the API never sends, so it passed while AC-2 was broken in the browser | Fixed: the client reads `data.appCode`; found only by the hosted run (ERR-1) |
