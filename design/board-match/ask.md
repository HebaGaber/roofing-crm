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
| CrmAsk1440 | `/ask`, answered | Built, in-map visual not compared | CrmAsk1440.png | Now the map's AI mode (`/?mode=ai`, panel `AskPanel`); `/ask` redirects there. Not captured in the map: the in-map render could not be stubbed here (the map crashes without its own API fixtures), so this row rests on the panel unit tests and the earlier standalone captures. The map owner compares it in the map record. Answer | Matches tabs, Show on map and the numbered sources are built; the Close tab, Sort and the editable "Read as" chips stay deferred (no API). |
| CrmAsk390 | `/ask`, answered | Built, in-map visual not compared | CrmAsk390.png | Now the map's AI mode (`/?mode=ai`, panel `AskPanel`); `/ask` redirects there. Not captured in the map: the in-map render could not be stubbed here (the map crashes without its own API fixtures), so this row rests on the panel unit tests and the earlier standalone captures. The map owner compares it in the map record. Answer | Matches tabs, Show on map and the numbered sources are built; the Close tab, Sort and the editable "Read as" chips stay deferred (no API). |
| CrmAsk768 | `/ask`, answered | Built, in-map visual not compared | CrmAsk768.png | Now the map's AI mode (`/?mode=ai`, panel `AskPanel`); `/ask` redirects there. Not captured in the map: the in-map render could not be stubbed here (the map crashes without its own API fixtures), so this row rests on the panel unit tests and the earlier standalone captures. The map owner compares it in the map record. Answer | Matches tabs, Show on map and the numbered sources are built; the Close tab, Sort and the editable "Read as" chips stay deferred (no API). |
| CrmAskWorking390 | working | Deviation: no Cancel | CrmAskWorking390.png | Cancel: review-log row 46 (`agent.ask` has no abort; hiding a charged answer would mislead). The PO said keep it deferred. Spinner, timer, progress, limit hint match. The hint says 23 s (the server's real stop), the board says 25 s. |
| CrmAskNoResults390 | empty_in_scope | Deviation: no Widen / Open chips | CrmAskNoResults390.png | Chips: review-log row 47 (no structured plan-edit input on `agent.ask`). Sentence, exclusions and reason pills match. |
| CrmAskLowConf390 | needs_clarification with candidates | Matched, data differs | CrmAskLowConf390.png | The board's "roof ages from year built only" banner is not a wire field: review-log row 49. Candidate chips are the live equivalent. |
| CrmAskOutside390 | out_of_scope | Deviation: no Use-place chips | CrmAskOutside390.png | Review-log row 50 (server sends candidates only on needs_clarification). The board's "no permit data here" note needs live coverage: row 69 area, deferred. |
| CrmAskNotFound390 | not_found | Deviation: no Use-place chips | CrmAskNotFound390.png | Same rows. |
| CrmAskThrottled390 | rate_limited | Matched | CrmAskThrottled390.png | Countdown from `retryAfterSec`, Ask held until zero, last answer kept under the banner. The board's "Wait 40 s" chip in the tab row has no counterpart (no tab row). |
| CrmAskPaused390 | paused | Matched, data differs | CrmAskPaused390.png | Reset time from `resetsAt`, local and UTC. The "AI paused" chip in the tab row has no counterpart. |
| CrmAskSlow390 | timed_out | Deviation: no "Use Filters instead" | CrmAskSlow390.png | Review-log rows 42 and 53. Try again is built. |
| CrmAskConfirm390 | answered, Create lead on the row | Built, in-map visual not compared | CrmAskConfirm390.png | Create leads for all n opens a confirmation sheet (the candidate list sheet's look) listing each property with its main signal; already-leads and no-coordinate rows are marked skipped. `agent.confirmLeads` sends only the creatable ids. |
| CrmAskConfirm1440 | same | Built, in-map visual not compared | CrmAskConfirm1440.png | Same sheet, centred dialog at 600 px and up. |
| CrmAskCreated390 | confirmLead succeeded | Built, in-map visual not compared | CrmAskCreated390.png | Snackbar "{n} leads created · {m} already leads" with Undo (`leads.undoCreate` per created lead, kept-reason wording) and Open Leads. Rows say Lead created. |
| CrmAskCreateFailed390 | confirmLead failed | Built, in-map visual not compared | CrmAskCreateFailed390.png | A refused create keeps the sheet open with the typed reason in an alert; Create again retries. |
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

Update for Ask in the map: the three boards above, the Confirm, Created and CreateFailed rows are now
built in the map's AI mode. Their counts below are from the earlier standalone comparison and are
superseded by these rows.

Counts: 28 boards. Matched 2, Matched with data differing 8 (LowConf, Paused, NoAddress,
NoContractor, CrmAgent 1440/390/768, AgentPaused390), Deviation 18 (3 of them "pending PO decision").

Ask inside the map: the handoff (CRM-HANDOFF section 4.7) says the CRM agent is the map's AI mode with
the switch on, and the rail AI item, the 390 Ask tab and the property drawer's Ask open it. Ask as its
own page (review-log rows 33 and 42) was the builder's choice, not a PO decision. Moving Ask into the map
screen (Answer / Matches / Close tabs, numbered pins, Widen chip) is pending a PO decision and is not
built here.

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

## Ask in the map (PO decision: the agent is the map's AI mode)

- `AskPanel` (`routes/Ask/AskPanel.tsx`) takes the props in the build contract: `threadId`,
  `initialQuestion`, `focusedCitation`, `onFocusCitation`, `onAnswer`, `onShowOnMap`, `layout`
  (`pane` at 840 px and up, `sheet` below). Its root is `data-panel="ask"` with the same `data-state`
  values as before and the same `#ask-result-heading`.
- Answer | Matches tabs. Matches lists `answer.rows` (up to 25): the citation number when a claim cites
  the row, TCAD id, near {place} and distance, roof age with its basis in words, permit class (stalled is
  derived) and open years, contractor state, the reason for each missing value, Open on map and the
  per-row Create lead. When the answer carries no rows the tab says so in words.
- Numbers: a citation circle, its source row, its Matches row and its map pin all carry the citation id
  (`answerPins` uses `n` = citation id), so the number in the text is the number on the pin. Clicking a
  circle calls `onFocusCitation`; the focused row is marked and outlined.
- Show on map calls `onShowOnMap`; it is off, with the reason in words, when no cited property has
  published coordinates ("No map pins: ..."), and a partial case counts the ones without a pin.
- `onAnswer` fires with each new answer, with the last real answer while a rate-limit or paused banner
  shows, and with null before the first. It does not fire while a question is working.
- Create leads for all n: `agent.confirmLeads` (typed from the router), Undo through `leads.undoCreate`.
  The panel has its own small confirmation sheet (`AskConfirmSheet.tsx`, styles of the candidate list
  sheet): the candidate sheet needs an existing lead's status, which an answer's proposal does not carry.
- `?q=`: the map reads it and passes `initialQuestion`; the panel prefills and focuses the box, never
  asks. Empty, blank and over-500 values are ignored. `/ask` redirects to `/?mode=ai` with `q` kept (see
  `askRedirectTo`).
- Still deferred (no API): editable "Read as" assumption chips and Widen / use-place chips, Cancel while
  working, the Close-matches tab, Sort.

Gaps 1, 2 and 4 above are now wire fields or procedures (`citations[].lat/lon/nearPlace`, `rows[]`,
`agent.confirmLeads`); gaps 3, 5 and 6 remain.
