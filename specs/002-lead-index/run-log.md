# Run log: B-02 lead search index

Budget: 1.5% of weekly quota (COST-MODE.md). Cost mode: Sonnet main session, Haiku for chores, Sonnet for design/build/review, no Opus.

## Progress checklist (mirrors WALKTHROUGH-B-02-lead-index.md § "✅ Progress checklist")

**A · Ready**
- [x] **A1** · 2026-10-23 · Stage 0: B-01 merged (`fcd6d6a`); Task A A-02 status `Done` (frozen); sample manifest CID reachable via CloudFront `d2xsqoqv09bd0q.cloudfront.net/{cid}` → 200; `git status` shows only pre-existing untracked docs, nothing blocking
- [x] **A2** · 2026-10-23 · G4 pre-check on `stories/B-02-lead-index.md` (Haiku subagent): FAIL (5 findings). 2 pure-wording fixes applied in place (NFR-001/NFR-002 observation points; AC-1/AC-4 hosted-runtime note in Independent test). 2 meaning-affecting findings deferred to Round 1 (AC-2 testability tightening re: sample-vs-full-county scope; eval-point/slicing primary). 1 finding (dependency staleness) traced to `docs/plan.md:102` being stale, not the story — no story change needed, A-02 is actually Done.
- [x] **A3** · 2026-10-23 · branch `002-lead-index` created; spec FR-001..004 ↔ AC-1..4 written (`specs/002-lead-index/spec.md`); clarify found 0 critical ambiguities (2 deferred to Round 1); checklist 16/16; committed `ac384e4`

**B · Design + plan**
- [x] **B1** · 2026-10-23 · alakazam + espeon + machamp design consults saved to `specs/002-lead-index/agent-design.md`; Disagreements table shows convergence, no blocking disagreement
- [x] **B2** · 2026-10-23 · plan + tasks (INDEX/espeon, SYNC/machamp, one build wave) · analyze (D1/D2 fixed) · G5 FAIL→fixed, G6 FAIL→fixed (pre-checks not re-run after fixes; final PASS/approval is the user's at the gate)

**C · Build**
- [x] **C1** · 2026-10-23 · espeon's local prototype (`scripts/local-rag-poc/query.ts`) proven against the real sample manifest before T014 started (14 properties, 35 permits; one real missing-roof-age reason captured), per T013's gate
- [x] **C2** · 2026-10-23 · INDEX (espeon, T012-T026) and SYNC (machamp, T027-T038) build wave, both complete, parallel subagents, tests-first throughout — see Subagent calls
- [x] **C3** · 2026-10-23 · integration check: full workspace (`pnpm -r test`, `type-check`, `lint`, `format`) green after fixing collateral from the Phase 1 vendoring (below); T040 (reuse-table test copy/adapt) delegated to Haiku

**D · Prove live**
- [ ] **D1** deploy + sample sync
- [ ] **D2** count check vs Oracle (donphan)
- [ ] **D3** idempotent-rerun proof
- [ ] **D4** evidence

**E · Review**
- [ ] **E1** review round → CR-B-02.md
- [ ] **E2** fixer, re-score, CI green

**F · Close-out**
- [ ] **F1** `/speckit-converge`, G7 pre-check
- [ ] **F2** 🛑 Round 2: G7 approval, merge, push
- [ ] **F3** merge --no-ff, progress.sh, TIME-STATS, budget line

## Log

| Step | Time | Result |
| --- | --- | --- |
| A1 Stage 0 | 2026-10-23 | PASS — see above |
| A2 G4 pre-check | 2026-10-23 | FAIL→fixed (wording); 2 items → Round 1 |
| A3 spec + clarify | 2026-10-23 | spec.md written, 0 clarify questions, checklist 16/16, committed ac384e4 |
| Budget check (end Phase A) | 2026-10-23 | 104.2% weekly quota (over 90% stop line). User decision: continue as planned — overage is from other tracks, not B-02; re-check at each phase end |
| Round 1 stop | 2026-10-23 | AC-2 tightened to ≤0.1% (user chose Recommended); eval-point recording kept as-is (Recommended); seed fixture deferred to B-03 (user override of Recommended) |
| Budget check (end Phase B) | 2026-10-23 | 105.3% weekly quota. Proceeding to Phase C per earlier decision; 🧹 new session before Phase C per cost mode C3 |
| Resume, new session | 2026-10-23 | Resumed into Phase C per Resume script. T001: copied `packages/contract`→`packages/oracle-contract`, `scripts/verify-manifest.ts` (Oracle repo clean at those paths); `packages/query-core` had uncommitted deletions in the Oracle repo mid-copy (another track's in-progress revert) — copy script refused the dirty tree, so used read-only `git archive HEAD` to vendor the last clean commit into `packages/oracle-views` instead (never touched the Oracle working tree), logged in docs/reuse-log.md with that explanation. Also discovered and vendored `profiles/travis-austin@1.0.0`→`packages/oracle-profile-travis-austin` (a query-core dependency the task description didn't name). Found and fixed: zod v3 (this workspace) vs vendored zod v4 (Oracle packages) can't compose schema objects across the major-version boundary — reused `isCidV1`/`MISSING_REASONS` as plain data instead of embedding zod4 schema instances; vendored tsconfigs pointed at a nonexistent `tsconfig.base.json`, repointed to `../tsconfig/node.json`. Renamed `@countylens/*` → `@crm/oracle-*` across all three vendored packages per the B-01 rename-pass precedent. |
| T002-T011 | 2026-10-23 | Setup scaffolds (index-schema, apps/sync, scripts/local-rag-poc) + DATA_MANIFEST_CID added to @crm/config (tests-first, 3 pre-existing tests updated for the new required field) + @crm/observability built fresh (Logger/Tracer/Metrics middleware, METRIC_NAMES constants) — Powertools Logger writes via its own internal Console bound to process.stdout outside POWERTOOLS_DEV mode, not the global `console`, so the test spies process.stdout.write (matches real/prod behavior). T008 (plan.contract.test.ts) and T009 (crm-data-stack.test.ts, crm-sync-stack.test.ts, replacing B-01's "intentionally empty" assertions in stacks.test.ts) written and confirmed failing — their implementations land in Phase 3/4 below. All of @crm/config, @crm/index-schema, @crm/observability pass test+type-check; infra suite: 13 pass (unchanged stacks), 6 new fail as expected. |
| Gap noted, not blocking | 2026-10-23 | `scripts/verify-manifest.ts` imports `../pipeline/publish/src/verify.ts`, not yet vendored — needed for Phase D's gateway cross-check, not Phase C. |
| C2 build wave | 2026-10-23 | espeon (INDEX, T012-T026) and machamp (SYNC, T027-T038) both completed in parallel, tests-first, all shown failing then green. espeon: `scripts/local-rag-poc` CLI proven against the real sample manifest; `apps/sync/handlers/{buildIndex,validate,promote,plan}.ts`; `apps/api/src/adapters/duckDbParquet.ts` (LeadIndex port). Added `"unverified_part"` to `IndexMetaHeldReason` (additive). machamp: `packages/config/gatewayPolicy.ts`; `apps/sync/handlers/{fetchPart,costGate}.ts`; `apps/sync/src/s3PartWriter.ts`; filled `infra/lib/{crm-sync-stack,crm-data-stack}.ts` (5 Lambdas, 1 state machine, DLQ+alarm, IAM Deny on all 6 roles). Found and fixed a pre-written test's regex (DefinitionString's ASL JSON is Fn::Join-escaped). Neither group touched the other's files (both confirmed via git status). |
| C3 integration — vendoring collateral | 2026-10-23 | Full-workspace test/lint/format/typecheck surfaced issues from the Phase-1 copy-and-rename, not from either builder's new code: (1) `packages/query-core`'s own tests needed `profiles/travis-austin@1.0.0` vendored too (a dependency T001's copy list didn't name) — renamed directory to `packages/travis-austin@1.0.0` to satisfy AD-26's own directory-name-encodes-version invariant (not a cosmetic rename); (2) several vendored test/script files still pointed at Oracle's original paths (`packages/query-core`, `profiles/travis-austin@1.0.0`) — fixed across `oracle-views`' tests, scripts, and generated-SQL header; (3) vendored `contract/v1` sample fixture (20 rows, CID-verified, explicitly named in CLAUDE.md's access boundary alongside published CIDs and the MCP — distinct from the "never copy real harvested data" rule) was needed by `oracle-views`' own acceptance tests; vendored it and regenerated `packages/oracle-views/generated/*.sql` after the rename (byte-exact regeneration, not hand-edited); (4) `docs/decisions/0002-lexicon-carriers.md` (an ADR a vendored test reads) vendored for the same reason. (5) ESLint's AD-19 rule ("DuckDB only in `apps/*/src/engine/**`") caught `apps/api/src/adapters/duckDbParquet.ts`'s direct `@duckdb/node-api` import — extracted `apps/api/src/engine/duckdb.ts` and, for consistency (the glob happens not to cover `apps/sync/handlers/**`, but the architectural intent is the same), `apps/sync/src/engine/duckdb.ts` too. (6) CDK bundling failed on `@duckdb/node-api`'s platform-native binding (esbuild can't resolve a `require()` switched on `process.platform`) — added `bundling.nodeModules`/`externalModules` for `BuildIndexFunction` only. (7) `prettier --write` on the first pass reformatted `contract/v1/columns.json`/`pilot-manifest.json` (vendored, CID-recomputed) breaking two byte-exact tests — reverted to the original bytes and added `contract/v1/`, the oracle-views test fixtures, and its generated SQL to `.prettierignore`. All of these are collateral from my own Phase 1 copy, not findings against either builder's work. |
| C3 final state | 2026-10-23 | `pnpm -r test`: 523 tests pass across 15 workspace packages/apps (0 fail, 5 skipped in oracle-views — pre-existing, unrelated to B-02). `pnpm -r type-check`: clean. `pnpm lint`: clean. `pnpm format`: clean. `scripts/local-rag-poc` (outside the pnpm workspace by design): 2/2 tests pass, `tsc` clean (needed its own `npm install` incl. a missing `vite` peer dep for vitest5). |

### Subagent calls

| Agent | Model | duration_ms | tokens | tool_uses | Purpose |
| --- | --- | --- | --- | --- | --- |
| developmentsupport-g4-precheck | Haiku | 42094 | 69996 | 6 | G4 pre-check on stories/B-02-lead-index.md |
| soofi-xyz-team-kit:alakazam | Sonnet | 38006 | 79965 | 4 | B1 design consult: retrieval/index design |
| soofi-xyz-team-kit:espeon | Sonnet | 38045 | 65098 | 3 | B1 design consult: sync pipeline mechanics (primary builder) |
| soofi-xyz-team-kit:machamp | Sonnet | 20443 | 65614 | 2 | B1 design consult: batch job, cost gate, idempotency |
| (main session) | Sonnet | — | — | — | B2 /speckit-plan: plan.md, research.md, data-model.md, contracts/, quickstart.md |
| (main session) | Sonnet | — | — | — | B2 /speckit-tasks: tasks.md (44→46 tasks after fixes) |
| (main session) | Sonnet | — | — | — | B2 /speckit-analyze: D1 CRITICAL, D2 HIGH found and fixed; D3/D4/D5 deferred |
| developmentsupport-g5-precheck | Haiku | 88722 | 119621 | 13 | G5 pre-check: FAIL (7/10) → 3 fixed directly (C-03, C-04, C-07), 1 fixed via file (C-10), 3 recorded as judgment calls in plan.md Complexity Tracking (C-02, C-05, C-08) |
| developmentsupport-g6-precheck | Haiku | 48711 | 73189 | 6 | G6 pre-check: FAIL (5/9) → all 5 fixed (C-04, C-05, C-06, C-07, C-09) |
| soofi-xyz-team-kit:espeon | Sonnet | 2031949 | 356347 | 184 | C2 INDEX build wave: T012-T026 (local prototype, BuildIndex, Validate, Promote, Plan, LeadIndex port) |
| soofi-xyz-team-kit:machamp | Sonnet | 1209222 | 275537 | 133 | C2 SYNC build wave: T027-T038 (gatewayPolicy, FetchPart, idempotency, DLQ+alarm, cost gate, infra stacks) |
| (main session) | Sonnet | — | — | — | C3 integration check: full workspace test/type-check/lint/format, fixed vendoring collateral (see log row above) |
| T040 reuse-table tests | Haiku | — | — | — | dispatched, result pending |

### Answers given (word for word)

(none yet — Round 1 not reached)
