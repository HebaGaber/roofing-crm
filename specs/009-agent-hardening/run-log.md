# B-09 run log — read this before `../assessment-guide/WALKTHROUGH-B-09-agent-hardening.md`

**This file is the source of truth for how this story actually runs.** The walkthrough file above is the
*original plan*; it is stale in three ways this run deviates from it, all approved by the user on 2026-10-24:

1. **No reuse from Task A A-13/A-14.** Confirmed by reading `stories/A-13-explorer-and-pages.md` (status: Draft)
   and `stories/A-14-agent-and-mcp.md` (status: Ready) in the oracle pipeline repo — neither is Done, and no
   `agent.ask.ts`/`getModel.ts`/breakpoints-config/`tablet.css`/`compact.css` exist there to copy. **Do not run
   the `copy-from-oracle.sh` commands in the walkthrough's Phase C.** Build the agent runtime (`agent.ask`
   procedure, `getModel()`/`AI_PROVIDER` switch, Zod tools, Answer panel, golden-query harness) and the
   responsive config (breakpoints, `tablet.css`/`compact.css`) natively inside roofing-crm instead, reusing
   B-01/B-03's existing responsive baseline where it already exists. **Swap-back condition:** when the user
   says A-13 and/or A-14 have merged, re-diff roofing-crm's native version against theirs and reconcile.
2. **Data source: Task A's Run 1 manifest by direct CID, not the Elephant MCP.** CID
   `bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu` (441,961 properties / 17,387 permits) is pinned
   and real, but Atlas registration (the catalog step that makes it discoverable by county name through the
   MCP) hasn't happened yet. Read property/permit data directly by this CID. **Swap-back condition:** when the
   user confirms Atlas registration for Travis County is complete, switch the data-access pointer back to the
   MCP/`listPublishedCounties` path (AC-7, no architecture change expected).
3. **Two added ACs beyond the original walkthrough:** AC-7 (the data-switch deviation above, now in
   `stories/B-09-agent-hardening.md` and `spec.md`) and AC-8 (targeted prototype re-audit — `audino` + `smeargle`
   re-diff every screen against `design/screens/` for drift since B-03's last clean review, fix or defer each
   finding with a reason). Release steps R1–R6 (not R7/demo video, not final "ready to publish") are folded into
   this story's Phase F close-out — see "Release fold-in" in the story file.

DLQ alarm SNS subscriber: `eng.heba.gaber@gmail.com` (user-provided, not the walkthrough's placeholder).
Golden queries G1–G7: run against the Run 1 full-county data (point 2 above), not the 35-row sample — real
signal now available at county scale.

## Progress (one line per step)

- 2026-10-24 · A1 · Confirmed B-07 merged (`git log` shows `8b13240 B-07: merge leads + lead list`).
- 2026-10-24 · A1 · Confirmed A-13/A-14 NOT done upstream → native-build deviation (point 1 above).
- 2026-10-24 · Round 1 (ad hoc, before A2) · User answered: direct-CID data switch, golden queries vs Run 1,
  DLQ email `eng.heba.gaber@gmail.com`, targeted prototype re-audit scope, native build over waiting on A-13/A-14.
- 2026-10-24 · A2 · Story expanded (AC-7, AC-8, Release fold-in, deviations documented); G4 pre-check PASS, 0 FAIL
  (`docs/gates/G4-B-09-precheck.md`); user approved Ready. Committed `88cb7a5`.
- 2026-10-24 · A2 · `/speckit-specify` → `spec.md` written, requirements checklist 16/16 passing.
- 2026-10-24 · A2 · `/speckit-clarify` → no critical ambiguities (decisions already resolved pre-spec).
- 2026-10-24 · B · Design consults run read-only: `alakazam` (Opus), `ash`, `smeargle`, `porygon`.
  Answers compiled in `specs/009-agent-hardening/agent-design.md`. Two corrections found and resolved
  without new PO input (both already settled by binding docs): confidence bands follow ADR-06 exactly
  (auto ≥0.92 · clarify 0.80–0.92 · refuse <0.80), and the prototype path is `design/prototype/CrmAsk*.dc.html`,
  not `design/screens/`.
- 2026-10-24 · C · `/speckit-plan` → `plan.md`, `research.md`, `data-model.md`, `contracts/agent-api.md`,
  `contracts/observability.md`, `quickstart.md`. Technical design reuses the already-accepted ADR-06
  agent architecture (`docs/decisions/0000-agent-architecture.md`), nothing under which was built yet.
  The two corrections above applied to `stories/B-09-agent-hardening.md` and `spec.md`. Committed `dc2d3e0`.
- 2026-10-24 · C · `/speckit-tasks` → `tasks.md`, 60 tasks (T001–T060) + Phase Z/N, organized by spec.md's
  5 user stories with US4 (data switch) sequenced before US1/US2 (their golden-query tests need the real
  manifest CID to mean anything). 3 builder groups tagged per task: `alakazam`, `ash`, `metagross`. Committed `d8d28cd`.
- 2026-10-24 · C · `/speckit-analyze` → 0 CRITICAL, 1 HIGH (F1: invalid `[US-shared]` label on a
  Foundational task), 1 MEDIUM (F2: a confirm-flow guard test scheduled before the file it tests
  exists), 3 LOW (no action needed). User approved applying all fixes immediately. Both fixed:
  F1's label dropped; F2's test moved into Phase 4/US1 as T029 (renumbered T012–T029, net-zero
  shift from T030 on). Committed `d8e9299`.
- 2026-10-24 · D · Drafted `testplans/B-09-test-cases.md` (27 functional/NF cases + edge-case rows)
  from the story's ACs, independent of `tasks.md`, per constitution XXII. Committed `b48b26c`.
- 2026-10-24 · D · G5 pre-check on plan.md/tasks.md: **PASS, 0 FAIL** — fixed Phase N/Phase Z
  ordering in `tasks.md` so the hosted-runtime proof is genuinely last (matches B-07's gated
  precedent); added TZ07 for the post-merge `docs/progress.md` update. `docs/gates/G5-B-09-precheck.md`.
- 2026-10-24 · D · G6 pre-check on `testplans/B-09-test-cases.md`: **FAIL, 1 FAIL** — added the
  missing TC-025b (ADR-06's 0.80–0.92 clarify band had no case), fixed the Login assumption for
  non-UI case types and the automation mapping for 7 Infra/Docs cases. The one remaining FAIL
  (C-07, real test data) is expected and documented: the Run-1-manifest record values are left as
  placeholder tokens until US4 (the data switch) actually deploys — filling them now would be
  fabricated data, not a drafting gap. `docs/gates/G6-B-09-precheck.md`. **Awaits your decision**:
  approve G6 with this one documented exception (same pattern as B-07's "G7 approved with
  exceptions," `be3c337`), or hold G6 until US4 deploys and the tokens are filled with real values.
  Committed `05d64af`.

- 2026-10-24 · D · **User decision:** hold G6 until data is ready (US4 deployed/data readable),
  Atlas registration, and A-13/A-14's upstream merge status — proceed with what's buildable in the
  meantime. **Recorded exception to constitution XVIII** ("No `/speckit-implement` before G4, G5
  and G6 pass"): G6's one open failure (C-07, real test data) blocks *running* the golden-query
  harness and the live Playwright suite against real values — it does not block *writing* the
  code those tests will exercise. Implementation proceeds now on that basis: every task except
  T047 (run golden queries against the deployed agent) and the token-fill step in
  `testplans/B-09-test-cases.md` can complete without real data. G6 stays FAIL/Held in
  `docs/traceability.md` until data readiness lets those two items close it for real — this is not
  a silent reinterpretation of the gate, it's a recorded, user-directed exception, same category as
  B-02's/B-03's/B-07's prior "approved with exceptions" gates.
- 2026-10-24 · E · `/speckit-implement` started under the exception above.

## Next step

Continue `/speckit-implement`, delegating each task group to its `soofi-xyz-team-kit:{builder}`
subagent plus `apply-engineering-guidelines`, per constitution XV. T047 and the test-case token
fill stay blocked on data readiness. Stop before G7 approval, merge, push, or deploy — unchanged.

## Resume prompt (paste after `/clear`, a crash, or a new session)

```text
Resume story B-09 from inside /Users/hebagaber/Github/roofing-crm (already on branch 009-agent-hardening).
Read specs/009-agent-hardening/run-log.md FIRST — it overrides
../assessment-guide/WALKTHROUGH-B-09-agent-hardening.md wherever they conflict (three deviations listed at
the top). Then check git log and git status. Continue from "Next step" above with the same rules: cost mode,
Sonnet, one Opus use only for alakazam's agent-design consult, stop for G7 approval before merge, never
merge/push/deploy without my approval.
```
