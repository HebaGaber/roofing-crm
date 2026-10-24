# Board match: group "ask"

Date: 2026-10-25. Started from commit 6d0c9e8 (HEAD moved to 5ddfa27 while working). Method: each
board and the live `/ask` page side by side at the board's width, the live app built from the working
tree and served with every API call stubbed (no AWS, no sign-in). Side-by-side PNGs (board left, live
right) are in the coordinator's scratchpad under `board-match/ask/`, named after the board.

Stubs follow the real wire shapes: `agent.ask` returns an `AgentAnswer` per outcome (answered,
empty_in_scope, needs_clarification with `candidates`, out_of_scope, not_found, rate_limited with
`retryAfterSec`, paused with `resetsAt`, timed_out); `agent.confirmLead` succeeds or fails. The
example values in the boards (Placeholder Pl, "J EXAMPLE", Run 3, 57) are not copied: the live page
shows what the answer carries, or why a field is missing.

Boards marked "Matched, data differs" match in layout, hierarchy, copy structure and components; only
the example values differ. The three `CrmAgent*` sizes, `CrmAgentLimit390`, `CrmAgentPaused390`,
`CrmAgentSlow*` and `CrmAgentWorking*` are the earlier boards, superseded by `CrmAsk*` (CRM-HANDOFF
section 9.1); they are compared against the same live states.

## What changed

- **Two panes at 1024 and up, one column below**, as `CrmAsk1440` (AI pane left, answer right) and
  `CrmAsk390`: the title is "Ask the agent" with the sparkle glyph; the question is a rounded card
  with a text area (Enter asks, Shift+Enter adds a line), the line "Signed in · answers cite
  CountyLens run {n}" (the run comes from the same `shell.indexInfo` query as the top bar chip, never
  a constant) and a pill **Ask** with the sparkle glyph.
- **Suggestions** (two example questions, the first from the README). Choosing one only fills the box.
- **The answer is prose with numbered references**, as the boards: each claim ends in numbered
  circles that link to the numbered source rows below it (TCAD id as the title, record id, provenance
  line, Open on map). **Create lead** is a tonal button on the source row of the proposed property
  only (never on a cited row the answer did not propose); a proposal no claim cites keeps its own row.
  Already a lead is a pill; failures are a banner (error or warning tone) with the typed message.
- **The question echo** has the robot glyph; **"4 steps done"** shows from `trace.toolSteps` when the
  server ran tools.
- **Banners**: out of scope, not found and "I'm not sure which place" are warning banners with their
  own glyphs, the Use-place chips under them. The empty and not-published sentences are plain lead
  text. Missing-data pills use plain field names (Address, Contractor), not column names.
- **Rate-limited and paused keep the last real answer on screen** under the banner, as
  `CrmAskThrottled390` / `CrmAskPaused390`. The words "Your last answer" appear only when there is one.
- **`/ask?q=` prefill** for the first-visit card: fills and focuses the box, never asks, removes the
  param with `replace`; empty, blank and over-500-character values are ignored.
- The label reads "Ask your question in plain English", so the accessible name still contains
  "Question" and every e2e selector keeps working.

## Matrix

| Board | Route + state | Status | Side-by-side | Notes |
|---|---|---|---|---|
| CrmAsk1440 | `/ask`, answered | Matched, data differs | CrmAsk1440.png | Board nests Ask in the map screen; see Deferred rows. Numbered pins on the map are not built (review-log row 43). |
| CrmAsk390 | `/ask`, answered | Matched, data differs | CrmAsk390.png | Same. The board's map behind the sheet is not part of `/ask`. |
| CrmAsk768 | `/ask`, answered | Matched, data differs | CrmAsk768.png | One column under 1024. |
| CrmAskWorking390 | working | Deviation: no Cancel | CrmAskWorking390.png | Cancel: review-log row 46 (`agent.ask` has no abort; hiding a charged answer would mislead). The PO said keep it deferred. Spinner, timer, progress, limit hint match. The hint says 23 s (the server's real stop), the board says 25 s. |
| CrmAskNoResults390 | empty_in_scope | Deviation: no Widen / Open chips | CrmAskNoResults390.png | Chips: review-log row 47 (no structured plan-edit input on `agent.ask`). Sentence, exclusions and reason pills match. |
| CrmAskLowConf390 | needs_clarification with candidates | Matched, data differs | CrmAskLowConf390.png | The board's "roof ages from year built only" banner is not a wire field: review-log row 49. Candidate chips are the live equivalent. |
| CrmAskOutside390 | out_of_scope | Deviation: no Use-place chips | CrmAskOutside390.png | Review-log row 50 (server sends candidates only on needs_clarification). The board's "no permit data here" note needs live coverage: row 69 area, deferred. |
| CrmAskNotFound390 | not_found | Deviation: no Use-place chips | CrmAskNotFound390.png | Same rows. |
| CrmAskThrottled390 | rate_limited | Matched | CrmAskThrottled390.png | Countdown from `retryAfterSec`, Ask held until zero, last answer kept under the banner. The board's "Wait 40 s" chip in the tab row has no counterpart (no tab row). |
| CrmAskPaused390 | paused | Matched, data differs | CrmAskPaused390.png | Reset time from `resetsAt`, local and UTC. The "AI paused" chip in the tab row has no counterpart. |
| CrmAskSlow390 | timed_out | Deviation: no "Use Filters instead" | CrmAskSlow390.png | Review-log rows 42 and 53. Try again is built. |
| CrmAskConfirm390 | answered, Create lead on the row | Deviation: no bulk confirmation card | CrmAskConfirm390.png | Review-log row 43: `agent.confirmLead` takes one `{threadId, tcadId}`. Per-row Create lead is the live equivalent. |
| CrmAskConfirm1440 | same | Deviation: same | CrmAskConfirm1440.png | Same. |
| CrmAskCreated390 | confirmLead succeeded | Deviation: no "{n} created · {m} already" banner or Undo | CrmAskCreated390.png | Row 43. Lead created pill and Open Leads match. |
| CrmAskCreateFailed390 | confirmLead failed | Matched, data differs | CrmAskCreateFailed390.png | Error banner inside the row; Create lead stays so it can retry. NOT_PROPOSED, NO_COORDINATES and RATE_LIMITED each have their own text and lock the button when retrying cannot work. |
| CrmAskNoAddress390 | answered, address and contractor missing | Matched, data differs | CrmAskNoAddress390.png | Rows show the TCAD id (the contract publishes no street address) and the missing-data pills with reasons. "near {place}" and the lat/lon line are not in the answer wire: gap below. |
| CrmAskNoContractor390 | same | Matched, data differs | CrmAskNoContractor390.png | Same. |
| CrmAskStates | idle | Deviation: overview board | CrmAskStates.png | An overview of five panels; each panel is compared as its own board above. The live idle page is the composer. |
| CrmAgent1440 | answered | Matched, data differs | CrmAgent1440.png | Earlier board, superseded by CrmAsk1440. |
| CrmAgent390 | answered | Matched, data differs | CrmAgent390.png | Same. |
| CrmAgent768 | answered | Matched, data differs | CrmAgent768.png | Same. |
| CrmAgentLimit390 | rate_limited | Matched | CrmAgentLimit390.png | The board's "no session quota" is the shipped design: no counter. |
| CrmAgentPaused390 | paused | Matched, data differs | CrmAgentPaused390.png | |
| CrmAgentSlow1440 | timed_out | Deviation: no "Use Filters instead" | CrmAgentSlow1440.png | Rows 42 and 53. |
| CrmAgentSlow390 | timed_out | Deviation: no "Use Filters instead" | CrmAgentSlow390.png | Same. |
| CrmAgentStates | idle | Deviation: overview board | CrmAgentStates.png | As CrmAskStates. |
| CrmAgentWorking1440 | working | Deviation: no Cancel | CrmAgentWorking1440.png | Row 46. |
| CrmAgentWorking390 | working | Deviation: no Cancel | CrmAgentWorking390.png | Row 46. |

Counts: 28 boards. Matched 2, Matched with data differing 12, Deviation with a recorded reason 14,
Deferred as a feature 0 (every deferral above is a deviation with its review-log row).
Ask as a mode inside the map (the boards' "AI mode") stays a deviation: Ask is its own page, review-log
row 42 note and row 33.

## Gaps (API or wire; not built here)

1. **Address line "near {place}" and lat/lon for a cited row.** `AgentAnswer.citations[]` carries
   `tcadId`, CIDs and provenance, no coordinates or nearest place. Proposed: add optional
   `citations[].lat`, `citations[].lon` and `citations[].nearPlace` (server-computed, as the property
   drawer header already is).
2. **Row facts** (roof age, permit class, open years, BBB state, contractor as printed). Boards show them
   per row; the wire carries them only inside claim text. Proposed: optional `rows[]` keyed by
   `citationId` with the same fields as a property row of `search.properties`.
3. **Structured widen / use-place / open-years chips.** Proposed: `agent.ask` input
   `{ threadId, planEdit: { radiusMi?, area?, openYearsMin?, roofAgeMinYears? } }`, re-running the
   previous plan without a new model plan call.
4. **Bulk confirm and Undo.** Proposed: `agent.confirmLeads({ threadId, tcadIds[] })` returning
   `{ created[], alreadyLeads[] }`, plus an undo (delete of the just-created leads).
5. **Low-confidence reason.** Proposed: optional `AgentAnswer.confidenceNote` (`{ field, basis }`).
6. **Cancel.** Needs an abort the server honours and does not charge twice (row 46).
