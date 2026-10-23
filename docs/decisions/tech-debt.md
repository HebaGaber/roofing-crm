# P2 drift log

Per `docs/architecture-constitution.md` § 14 ("Drift handling"): P2 items are logged here and picked up at the story that owns them, rather than blocking a gate. Each entry names the owning story.

## TD-1: Sync duration (A-03-sized run) is looser than metagross's original projection

- **Where:** `docs/architecture-constitution.md` § 10, "Sync duration, A-03-sized run" row (≤ 5 min).
- **Source:** `metagross`'s original consult projected < 3 min for this size; the G3-adopted D7 consolidation picked espeon's ≤ 5 min instead, as the number with the stronger measured gateway-politeness basis, not the stricter number — a deliberate exception to this document's general "take the stricter number" rule.
- **Raised by:** `metagross`'s G3 review (`docs/reviews/CR-G3-ARD-B.md`, finding F-1, low-severity half).
- **Resolution:** not a defect — no action required unless B-02's actual measurement comes in looser than 5 min, in which case re-open at B-02.
- **Owning story:** B-02.

## TD-2: `ConversationEventStore` component placement needs full detail at story time

- **Where:** `docs/architecture-constitution.md` ADR-06, § 9 module table (`apps/api` row).
- **Source:** `metagross`'s G3 review, finding F-4. The architecture constitution places the port/adapter in `apps/api/src/services/agent`; the full interface, the DynamoDB item shape it uses, and the AgentCore-Memory upgrade path still need to be specified in `specs/009-agent-hardening/agent-design.md` (alakazam, per constitution Article XIV) before `/speckit-plan` for that story.
- **Owning story:** B-09.

## TD-3: Lead DynamoDB item shapes are not restated in the architecture constitution

- **Where:** `docs/architecture-constitution.md` ADR-04.
- **Source:** `metagross`'s G3 review, finding F-2. ADR-04 now says explicitly that full item shapes live in `specs/007-leads/agent-design.md` (mew), not in the architecture constitution — this entry just tracks that the consult itself (`docs/decisions/0000-agent-architecture.md`, mew § 5 and § 7) is the starting draft for that file, and it needs to be reconciled with ADR-04's key format (`{fips}:tcad:{request_identifier}`) and gapless event sequencing before B-07's `/speckit-plan`.
- **Owning story:** B-07.

## TD-4: B-01's test-case document (`testplans/B-01-test-cases.md`) has accepted G6 polish gaps

- **Where:** `testplans/B-01-test-cases.md`, after 4 fix-and-retry rounds against the `developmentsupport-g6-precheck` skill (see `specs/001-crm-shell/run-log.md`).
- **Source:** the 4th G6 pre-check run flagged, and the PO accepted leaving open rather than running a 5th fix cycle:
  - TC-007 and TC-NF-03 still use short "repeat steps N–M" / "repeat TC-003's steps" shorthand rather than being fully unrolled into single-action steps (every other case in the file is fully unrolled).
  - TC-NF-03 asserts Powertools' Logger JSON shape on both Lambdas (NFR-001's "every Lambda wrapped with Powertools" clause) but does not separately assert a Tracer (X-Ray) segment or an EMF Metrics record for each — Logger coverage is verified, Tracer/Metrics are not.
  - TC-NF-02 still names its sibling phase ("Phase Z / TZ04" in `tasks.md`) rather than describing the `smeargle` suite's role in fully implementation-independent language.
  - The coverage matrix's Playwright test names are truncated with "…" rather than spelling out each case's exact `test()` title string.
- **Resolution:** not a defect against any AC — every acceptance criterion and NFR is still covered by a passing, runnable test; these are documentation-polish items in how the test plan is *written*, not gaps in what it tests. Revisit opportunistically if `testplans/B-01-test-cases.md` is edited again for another reason; no dedicated story owns closing this on its own.
- **Owning story:** B-01 (opportunistic only — not blocking any later story).

## TD-5: B-01's unit-test coverage is below 80% on `apps/api`, `apps/web` and `packages/api-client`

- **Where:** G7 pre-check (`docs/gates/G7-B-01-precheck.md`), check C-02. Measured coverage: `apps/api` 41.58% stmts, `apps/web` 56.25% stmts, `packages/api-client` 42.85% stmts (all other packages — `shared`, `config`, `ui`, `infra` — clear 80% on lines/statements).
- **Source:** the gap concentrates in Lambda/tRPC-router envelope code (`lockout-handler.ts`'s dispatch, `health.ts`'s wrapper, `routers/auth.ts`'s procedure body) and `signIn.ts`'s Cognito SRP call — all deliberately proven by the actual live deploy and the 60-case Playwright suite (`tests/e2e/B-01.spec.ts`, `config-guard.spec.ts`, `tests/e2e/responsive/*`) rather than mocked in Vitest, a choice stated explicitly in `apps/api/test/handlers/health.test.ts`'s own header comment ("the envelope is proven by cdk-nag/Powertools wiring... not a unit test"). The pure logic underneath each envelope (the lockout state machine, `classifySignInError`, the MapLibre bounds helper) is unit-tested and at or near 100%. `packages/api-client/src/react.tsx` (0% coverage) is a React Query integration layer built ahead of need — confirmed unused by anything in this story, likely intended for a future story's data-fetching, the same pattern as the intentionally-stubbed `CrmData`/`CrmSync` CDK stacks.
- **Resolution:** accepted, PO decision 2026-10-23 (G7 pre-check follow-up) — not a defect against any FR/AC/NFR; every requirement is proven, either by a unit test of its logic or by a passing live test of its envelope. Revisit if a future story's own coverage work touches these same files for another reason; no dedicated remediation story.
- **Owning story:** B-01 (opportunistic only — not blocking any later story or G7 approval).
