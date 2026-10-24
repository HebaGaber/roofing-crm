# Board-by-board match: group leads (Leads list, Lead page, Create lead)

Date: 2026-10-25. Started from commit a4497ca; the shell fixes below were added at 6d0c9e8. Method: design/board-match method (render the board at its width, drive the built app with stubbed `/api/trpc` responses, compare side by side, fix, repeat). Side-by-sides (board left, live right) are in `/private/tmp/claude-501/-Users-hebagaber-Github-roofing-crm/e699d592-f051-4b7f-9aa2-29f798421a54/scratchpad/board-match/leads/sbs/{Board}.png`.

Rules for the table: example data (addresses, names, run numbers) is not a difference. A value Task A does not publish shows its reason, which counts as a match. A gap in what `leads.*` returns or accepts is a Deviation with its gap id (see API gaps).

| Board | Route + state | Status | Side-by-side | Notes |
| --- | --- | --- | --- | --- |
| CrmLeads1440 | `/leads` 1440, 3 leads | Deviation: list rows carry no signals (G-1); no Permit open ≥, Sort, All reps, multi-status (G-2, G-3, G-4) | sbs/CrmLeads1440.png | Matched: header (Copy link text button, tonal Show on map), labelled filter card rows, one-sentence count line, table with heading row, Showing x–y of N. |
| CrmLeads768 | `/leads` 768 | Deviation: same as CrmLeads1440 | sbs/CrmLeads768.png | Filter card inline from 600 px; table from 768 px. |
| CrmLeads390 | `/leads` 390 | Deviation: same as CrmLeads1440 | sbs/CrmLeads390.png | Pinned header (Leads · n, icon actions) with Filters and one chip per active filter (All my leads when none); cards with the facts on one line. |
| CrmLeadsAllReps390 | `/leads?assignee=all` 390 | Deviation: no all-reps view (G-3) | sbs/CrmLeadsAllReps390.png | The API lists one assignee (default: the caller). Live offers Me and an exact name; `assignee=all` is read as a name. |
| CrmLeadsEmpty390 | `/leads` 390, no leads | Matched | sbs/CrmLeadsEmpty390.png | Filters hidden, Go to map. The line about swiping right in Triage is shortened to the Create lead action that exists on every surface. |
| CrmLeadsError390 | `/leads?status=new` 390, list fails | Matched | sbs/CrmLeadsError390.png | Headline, reason, Retry; the Filters chip and New chip stay (filters kept in the URL). |
| CrmLeadsFiltered1440 | `/leads?status=new&roof=15&permit=open&lat&lng&r=5` 1440 | Deviation: one status, one permit status, no Permit open ≥, no Sort, no place picker (G-2, G-4, G-11; review-log rows 58, 59) | sbs/CrmLeadsFiltered1440.png | Within is a point (latitude, longitude) or the device location, not a named place. |
| CrmLeadsLoading390 | `/leads` 390, pending | Matched | sbs/CrmLeadsLoading390.png | Count reads … leads, Loading your leads… (polite status), three skeleton cards. |
| CrmLeadsNoAddress1440 | `/leads` 1440 | Matched, data differs | sbs/CrmLeadsNoAddress1440.png | Title is the TCAD id and the line says Address not published with the coordinates. Missing: near {place} and the L-id (the list has no place; lead ids are ULIDs). |
| CrmLeadsNoAddress390 | `/leads` 390 | Matched, data differs | sbs/CrmLeadsNoAddress390.png | Same as CrmLeadsNoAddress1440. |
| CrmLeadsNoContractor1440 | `/leads` 1440 | Deviation: no Contractor column (G-1) | sbs/CrmLeadsNoContractor1440.png | The reason is shown on the Lead page (Contractor not published, with why). |
| CrmLeadsNoContractor390 | `/leads` 390 | Deviation: no contractor line on cards (G-1) | sbs/CrmLeadsNoContractor390.png | Same as CrmLeadsNoContractor1440. |
| CrmLeadsNoMatch390 | `/leads?status=won&roof=25&permit=stalled` 390 | Matched, data differs | sbs/CrmLeadsNoMatch390.png | Omits the count of all leads (the API returns only the filtered count). One Clear filters button, in the card. |
| CrmLeadsPaged1440 | `/leads?cursor=8` 1440 | Deviation: no numbered pages, 25 per page (G-12) | sbs/CrmLeadsPaged1440.png | Showing x–y of N with First page and Next page; the cursor is the API's. |
| CrmLeadsPaged390 | `/leads?status=new&roof=15&cursor=3` 390 | Deviation: same as CrmLeadsPaged1440 | sbs/CrmLeadsPaged390.png | Cards, pinned header and chips as the board. |
| CrmLeadsPartial390 | `/leads` 390, one lead not in the run | Matched, data differs | sbs/CrmLeadsPartial390.png | Banner: Property not in the current run (the list has the manifest CID only, not the run number); row pill adds · snapshot. |
| CrmLeadsStates | overview of the five list states | Matched | sbs/CrmLeadsStates.png | Montage of the five live states (loading, no leads yet, no match, error, partial), live/leads-states.png. |
| CrmLead1440 | `/leads/{key}` 1440, list left | Deviation: Assignee is read-only; no View property, no View lineage; no confidence, permit class or BBB state; no Now column (G-5, G-6, G-13) | sbs/CrmLead1440.png | Matched: list pane with the open lead marked and All filters, header with status menu, Show on map, signals at creation, Next steps (disabled, with reason), Notes (newest first), History in words. |
| CrmLead768 | `/leads/{key}` 768 | Deviation: same as CrmLead1440 | sbs/CrmLead768.png | Full page with Back to Leads. |
| CrmLead390 | `/leads/{key}` 390 | Deviation: same as CrmLead1440 | sbs/CrmLead390.png | Full page with Back to Leads. |
| CrmLeadChanged390 | lead with a newer run | Deferred: needs current signals from `leads.get` (G-6) | sbs/CrmLeadChanged390.png | The page cannot say what changed, so it does not show a Now column or Changed pill. |
| CrmLeadCreate1440 | drawer, Create lead tapped | Deviation: no Undo (G-7) | sbs/CrmLeadCreate1440.png | Snackbar Lead created · New · assigned to you, Open lead, View leads, Add a note (optional) with Skip and Save note, Dismiss. No L-id (ULID). View leads stays because tests/e2e/B-07.spec.ts follows it. |
| CrmLeadCreate390 | drawer 390, Create lead tapped | Deviation: no Undo (G-7) | sbs/CrmLeadCreate390.png | Snackbar above the bottom bar. |
| CrmLeadCreate768 | drawer 768, Create lead tapped | Deviation: no Undo (G-7) | sbs/CrmLeadCreate768.png | Same snackbar, centred. |
| CrmLeadDeleted390 | `/leads/{unknown key}` 390 | Deviation: the API cannot tell deleted from unknown (G-9) | sbs/CrmLeadDeleted390.png | Card says Lead not found, the link may be wrong or the lead deleted; no deleted-by line. |
| CrmLeadDetail1440 | superseded by CrmLead1440 | Deviation: same as CrmLead1440 | sbs/CrmLeadDetail1440.png | Board kept by the handoff, no longer linked. |
| CrmLeadDetail390 | superseded by CrmLead390 | Deviation: same as CrmLead1440 | sbs/CrmLeadDetail390.png | As above. |
| CrmLeadDetail768 | superseded by CrmLead768 | Deviation: same as CrmLead1440 | sbs/CrmLeadDetail768.png | As above. |
| CrmLeadDetailError390 | lead fails to load | Matched | sbs/CrmLeadDetailError390.png | Banner This lead could not be loaded with Retry and Back to Leads. |
| CrmLeadDetailLoading390 | lead pending | Matched | sbs/CrmLeadDetailLoading390.png | Loading lead… and skeleton. |
| CrmLeadDetailMissing390 | unknown lead | Matched | sbs/CrmLeadDetailMissing390.png | Lead not found card with Back to Leads. |
| CrmLeadDetailPartial390 | property not in the run | Matched | sbs/CrmLeadDetailPartial390.png | See CrmLeadStale390 for what differs. |
| CrmLeadDup1440 | drawer, Create lead on an existing lead | Deviation: no status or assignee in the message (G-8) | sbs/CrmLeadDup1440.png | Snackbar Already a lead. Nothing was added. with Open lead and View leads; nothing is created. |
| CrmLeadDup390 | drawer 390, existing lead | Deviation: no status or assignee in the message (G-8) | sbs/CrmLeadDup390.png | Same. |
| CrmLeadElsewhere390 | status change refused (STALE_SEQUENCE) | Matched, data differs | sbs/CrmLeadElsewhere390.png | Banner This lead was updated by someone else with Reload (no name: the API does not say who, G-10). The page now sends the loaded event sequence so this is detected. |
| CrmLeadLoading390 | lead pending 390 | Matched | sbs/CrmLeadLoading390.png | Back to Leads, Loading lead… status line, skeleton. |
| CrmLeadNoAddress390 | `/leads/{key}` 390 | Matched, data differs | sbs/CrmLeadNoAddress390.png | Title TCAD id, Address not published with coordinates; no near {place}. |
| CrmLeadNoContractor390 | `/leads/{key}` 390 | Matched | sbs/CrmLeadNoContractor390.png | Contractor not published pill with the reason, BBB Not checked · no name to look up. |
| CrmLeadSaveFailed390 | status save fails | Matched | sbs/CrmLeadSaveFailed390.png | Couldn't save the status. The change is undone. Nothing else changed. with Try again; the menu snaps back. |
| CrmLeadSaving390 | status save pending | Matched | sbs/CrmLeadSaving390.png | Saving the status… beside the menus while the select is disabled; Saved after. |
| CrmLeadStale390 | lead not in the current run | Deviation: snapshot values withheld (AC-5, constitution XI, P0-4) | sbs/CrmLeadStale390.png | Warning banner and the withheld-signals card replace the signals table the board still shows. Status, notes and history work. |
| CrmLeadStates | overview of the lead states | Matched | sbs/CrmLeadStates.png | Montage of loading, saving, save failed, not found, not in run, changed elsewhere, live/lead-states.png. |

## Summary

42 boards: 22 Deviation, 13 Matched, 6 Matched, data differs, 1 Deferred.

## What changed (top fixes)

- Leads list: page header with Copy link / Show on map (icons at 390), labelled filter rows, Me chip, count and filter sentence, table from 768 px and cards below, Showing x–y of N, pinned header with filter chips at 390, honest state cards (no leads yet with Go to map, no match with one Clear filters, error with Retry, partial banner).
- Lead page: list beside the lead at 1440, Back to Leads below, status menu with icon and Saving / Saved / Couldn't save / Reload states, History in words and newest first, notes as bubbles, signals as a two-column table with the basis in words, disabled Next steps with their reason on screen, not-in-run banner.
- Create lead: one tap, snackbar with Open lead and an optional first note; Already a lead and failure states.
- Status change and note now send the loaded event sequence, so a change made elsewhere is detected (STALE_SEQUENCE) instead of silently overwritten.

## Test hooks kept, and the one visible text change for tests/e2e

Kept: `li[data-lead-id]`, the link named TCAD {id}, the 'N leads' count element, the Status combobox (values new, contacted…), Add a note and Add note, the Notes, History and Current signals regions, `data-testid=not-in-run`, the Create lead button and its status line, View leads (href /leads), Back to leads, Clear filters, the Roof age threshold and Permit status groups, Area, Radius, mi, Center latitude / longitude.

Changed text that `tests/e2e/B-07.spec.ts` reads (coordinator to update, not edited here):
- list row time: `Created 2026-10-20 09:14 UTC` -> `Created Oct 20, 09:14 UTC` (the regexp in TC-001 that reads the stamp; the exact stamp is on the `time` element's `datetime` and `title`).
- Roof-age basis on the Lead page: raw code `permit` -> words `Basis: Last reroof permit` (TC-003 `toContainText(f.roofAgeBasis)` still matches for `permit`; it would not for `built_year` or `new_construction`).
- Open permit: `2003-012345 BP · open 2336 days` is now two lines, `2003-012345 BP` and `open 2336 days (6.4 yrs)`; both substrings TC-003 reads are present.
- Status pill in the header reads `Contacted` (was `contacted`); Playwright's getByText is case-insensitive, so TC-008 still matches.
- Add note button keeps its name; the board says Save. Kept for the e2e.

## API gaps (not built here), with proposed shapes

- G-1 list rows carry no snapshot: add `signals: { roofAgeYears?, roofAgeBasis?, permit?: { class, openDays }, contractor? }` and `lastActivity: { at, kind, text }` to each `leads.list` item (the board's Roof, Main permit, Contractor, Last activity columns).
- G-2 multi-select status: `leads.list` input `statuses: LeadStatus[]` (replaces the single `status`).
- G-3 assignee scope: `assignee: string | 'all'` plus `users.list` returning `{ id, name }[]` from the Cognito group (review-log row 17), for Me, All reps and the name menu.
- G-4 permit filter and sort: `filters.permitStatuses: ('open'|'stalled')[]`, `filters.permitOpenMinYears: number`, `sort: 'activity'|'roof'|'open'|'near'`.
- G-5 View property and lineage: store `propertyCid` on the lead and return it (and the lineage URL) from `leads.get`.
- G-6 changed signals: `leads.get` returns `currentSignals?: LeadSignals & { runId }` and `signalsRunId` for the snapshot, so the Now column and Changed pill can be drawn.
- G-7 Undo: `leads.undoCreate({ leadKey })`, a soft delete within a short window that writes a history event (review-log row 13).
- G-8 duplicate message: the ALREADY_EXISTS error data carries `{ leadKey, status, assignee }`.
- G-9 deleted: `leads.get` returns `deleted: { by, at }` instead of NOT_FOUND for a soft-deleted lead.
- G-10 who changed it: STALE_SEQUENCE error data carries `updatedBy`.
- G-11 named place: a place index in the web app or `places.search` for the Within picker.
- G-12 numbered pages: `leads.list` returns `pageCount` and accepts `page` (the cursor is an offset today); a page size the screen can choose (8 and 3 on the boards).
- G-13 assignee change: `leads.assign({ leadKey, assignee, expectedSequence })`.
