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

## Next step

`/speckit-plan` with this run-log + `stories/B-09-agent-hardening.md` + `specs/009-agent-hardening/agent-design.md`
as direction, then `/speckit-tasks` (3 groups: `alakazam` tools, `ash` agent runtime, `metagross`
responsive+observability+data-switch+dashboard), then `/speckit-analyze`, then G5/G6 pre-checks in parallel.

## Resume prompt (paste after `/clear`, a crash, or a new session)

```text
Resume story B-09 from inside /Users/hebagaber/Github/roofing-crm (already on branch 009-agent-hardening).
Read specs/009-agent-hardening/run-log.md FIRST — it overrides
../assessment-guide/WALKTHROUGH-B-09-agent-hardening.md wherever they conflict (three deviations listed at
the top). Then check git log and git status. Continue from "Next step" above with the same rules: cost mode,
Sonnet, one Opus use only for alakazam's agent-design consult, stop for G7 approval before merge, never
merge/push/deploy without my approval.
```
