---
id: UT-RPT-B-01
type: unit-test-report
feature: FEAT-B01
story: B-01
owner: Claude (session), approved by HebaGaber
status: Complete
gate: G7
created: 2026-10-23
---

# Unit Test Report: B-01 CRM shell with disabled roadmap sections

Real `pnpm run test` output (Turborepo, all 8 packages/apps), at commit `4483a57`, run locally with the repo's own scripts — matching what `.github/workflows/ci.yml`'s `workspace` job runs (see the CI note below).

## Summary

| Item | Value |
| --- | --- |
| Total test files | 11 |
| Total tests | 75 |
| Passed / failed | 75 / 0 |
| Pass rate | 100% |

## Per-package results

| Package | Test files | Tests | Result |
| --- | --- | --- | --- |
| `packages/config` | 1 | 5 | ✅ |
| `packages/shared` | 2 | 6 | ✅ |
| `packages/eslint-config` | 1 | 18 | ✅ |
| `packages/ui` | 1 | 3 | ✅ |
| `packages/api-client` | 1 | 4 | ✅ |
| `apps/api` | 2 | 9 | ✅ (includes `auth/lockout-handler.test.ts`'s 4-case state-machine coverage and `handlers/health.test.ts`'s `stripTrpcPrefix` regression test, found deploying) |
| `apps/web` | 3 | 18 | ✅ (MapLibre bounds helper, `classifySignInError`, Coming Soon) |
| `infra` | 1 | 12 | ✅ (all 6 CDK stacks, `Template.fromStack`, no AWS credentials needed) |
| **Total** | **11** | **75** | **✅ 75/75** |

## Also verified locally (same commands `.github/workflows/ci.yml`'s `workspace` job runs)

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `pnpm run type-check` | ✅ clean, all 8 packages |
| Lint | `pnpm run lint` (`eslint .`) | ✅ clean |
| Format | `pnpm run format` (`prettier --check .`) | ✅ clean |
| CDK synth + cdk-nag | `cdk synth --strict` (infra/) | ✅ 0 errors, 0 `AwsSolutions-*` findings, all 6 stacks |

## CI note

`.github/workflows/ci.yml` exists on this story branch (fixed in this story — see `specs/001-crm-shell/run-log.md`'s Phase E entry; the version T001 copied was almost entirely Task A's own CI, unadapted, and would have silently no-op'd or failed outright on every job). **It has never actually run on GitHub**, because GitHub Actions only triggers workflows that exist on the repository's **default branch** (`main`), and `main` currently has no `.github/workflows/` directory at all — a repo-wide bootstrapping gap, not something this story can fix (merging to `main` is explicitly out of scope per CLAUDE.md, and this story merges only into `feature/roofing-crm`). The table above runs every command the workflow's `workspace` job runs, locally, with real output, as the closest available substitute for "CI green" until a workflow file lands on `main`.

## Sign-off

**Decision:** ☐ Validated (counts toward G7) ☐ Returned, reason: {…} · pending the user's G7 approval (Round 2)
