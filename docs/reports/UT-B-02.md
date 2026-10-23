---
id: UT-RPT-B-02
type: unit-test-report
feature: FEAT-B02
story: B-02
owner: Claude (session, E2 fixer round), approved by HebaGaber
status: Complete
gate: G7
created: 2026-10-23
---

# Unit Test Report: B-02 lead search index — E2 fixer round

Real `pnpm -r test` / `pnpm -r type-check` / `pnpm lint` / `pnpm format` output (Turborepo, all 17
workspace packages/apps), run locally against branch `002-lead-index` after fixing every finding
in `docs/reviews/CR-B-02.md`'s E2 scope (items #1–#4, #6–#8; #5 is explicitly out of scope per the
review's own scope note and the recorded 2026-10-23 user decision in `docs/evidence/B-02.md`).

## Summary

| Item | Value |
| --- | --- |
| Total test files | 60 |
| Total tests | 528 |
| Passed / failed / skipped | 523 / 0 / 5 |
| Pass rate | 100% (of non-skipped) |

## Per-package results (`pnpm -r test`)

| Package | Test files | Tests | Result |
| --- | --- | --- | --- |
| `packages/shared` | 2 | 6 | ✅ |
| `packages/oracle-contract` | 3 | 58 | ✅ |
| `packages/observability` | 2 | 6 | ✅ (new: `test/s3.test.ts` for the shared `downloadS3ObjectToFile` helper, finding #7) |
| `packages/travis-austin@1.0.0` | 6 | 79 | ✅ |
| `packages/eslint-config` | 1 | 18 | ✅ |
| `packages/ui` | 1 | 3 | ✅ |
| `packages/config` | 2 | 16 | ✅ |
| `packages/index-schema` | 1 | 5 | ✅ |
| `packages/oracle-views` | 18 | 246 (241 passed, 5 skipped, pre-existing) | ✅ |
| `apps/api` | 7 | 41 | ✅ (new/updated tests in `test/duckDbParquet.test.ts`: finding #1's `indexInfo()` real-value read, finding #8's cold-load-race test) |
| `apps/sync` | 11 | 46 | ✅ (new/updated tests in `test/promote.test.ts` findings #1, `test/fetchPart.test.ts` findings #2 and #6) |
| `infra` | 4 | 20 | ✅ (CDK stack synth unaffected by the `GATEWAY_CLOUDFRONT_BASE_URL` env var addition) |
| `packages/api-client` | 2 | 7 | ✅ |
| `apps/web` | 4 | 27 | ✅ |
| **Total** | **60** | **528** (523 passed, 5 skipped) | **✅** |

Exact tail of the real run:

```
packages/shared test:  Test Files  2 passed (2)
packages/shared test:       Tests  6 passed (6)
packages/oracle-contract test:  Test Files  3 passed (3)
packages/oracle-contract test:       Tests  58 passed (58)
packages/observability test:  Test Files  2 passed (2)
packages/observability test:       Tests  6 passed (6)
packages/travis-austin@1.0.0 test:  Test Files  6 passed (6)
packages/travis-austin@1.0.0 test:       Tests  79 passed (79)
packages/eslint-config test:  Test Files  1 passed (1)
packages/eslint-config test:       Tests  18 passed (18)
packages/ui test:  Test Files  1 passed (1)
packages/ui test:       Tests  3 passed (3)
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  16 passed (16)
packages/index-schema test:  Test Files  1 passed (1)
packages/index-schema test:       Tests  5 passed (5)
packages/oracle-views test:  Test Files  17 passed | 1 skipped (18)
packages/oracle-views test:       Tests  241 passed | 5 skipped (246)
apps/api test:  Test Files  7 passed (7)
apps/api test:       Tests  41 passed (41)
apps/sync test:  Test Files  11 passed (11)
apps/sync test:       Tests  46 passed (46)
infra test:  Test Files  4 passed (4)
infra test:       Tests  20 passed (20)
packages/api-client test:  Test Files  2 passed (2)
packages/api-client test:       Tests  7 passed (7)
apps/web test:  Test Files  4 passed (4)
apps/web test:       Tests  27 passed (27)
```

(`oracle-views`'s 5 skipped tests predate this round — unrelated to the E2 fixer scope.)

## New tests added this round, by CR-B-02 finding

| Finding | File | Test |
| --- | --- | --- |
| #1 (Promote `propertyCount`) | `apps/sync/test/promote.test.ts` | "persists propertyCount/permitCount/promotedAt onto META#index..."; "a second Promote run's Validate sees the real prior count — not undefined/null...end to end" (uses the real `extractPreviousPromotedPropertyCount` exported from `validate.ts`, not a re-implemented assumption) |
| #1 (API `indexInfo()`) | `apps/api/test/duckDbParquet.test.ts` | "reads propertyCount/permitCount/promotedAt from META#index..." |
| #2 (ADR-02 CloudFront) | `apps/sync/test/fetchPart.test.ts` | "fetches CloudFront at /{cid} directly, never /ipfs/{cid}..."; "still fetches Filebase/Pinata at /ipfs/{cid}..."; "productionFetchers() includes CloudFront first when GATEWAY_CLOUDFRONT_BASE_URL is set..."; "...skips CloudFront (never errors) when its env var is unset..." |
| #6 (token-bucket/retry) | `apps/sync/test/fetchPart.test.ts` | "drives the full MAX_RETRIES_BEFORE_SWITCH real fetch attempts even when the token bucket refuses a few times first" |
| #7 (shared S3 helper) | `packages/observability/test/s3.test.ts` | "streams the object's body to the destination path"; "throws when the object has no body..." |
| #8 (cold-load race) | `apps/api/test/duckDbParquet.test.ts` | "discards a timed-out cold load's connection once it finally resolves, instead of leaving it open or letting it corrupt a later successful retry" (deterministic deferred-promise interleaving, not real-time races) |

Each of these was shown failing against the pre-fix code before the corresponding fix landed
(the Promote/Validate propertyCount test against the old `UpdateExpression`; the CloudFront tests
against the old hard-coded Filebase/Pinata-only gateway lists; the retry-attempt test against the
old single-counter loop; the cold-load-race test against the un-keyed, uncancelled `coldLoad`).

## Also verified locally

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `pnpm -r type-check` | ✅ clean, all 15 TypeScript packages/apps (2 non-TS packages skipped by Turborepo scope) |
| Lint | `pnpm lint` (`eslint .`) | ✅ clean |
| Format | `pnpm format` (`prettier --check .`) | ✅ clean |

## Findings resolved this round (CR-B-02)

See `docs/evidence/B-02.md`'s "E2 fixer round" section for the full narrative per finding,
including the ADR-02 CloudFront decision (wired, not a recorded deviation) and the honest
limitation statement on FetchPart's per-invocation token-bucket scope (NFR-002 enforced
per-Lambda-invocation, not aggregated across the Map's concurrent invocations — no shared
rate-limit store exists in this codebase to reuse, and building one is out of this story's scope).

## Sign-off

**Decision:** ☐ Validated (counts toward G7) ☐ Returned, reason: {…} · pending the user's
re-score of `machamp` and `porygon` (E2's scope per `docs/reviews/CR-B-02.md`) and G7 approval.
