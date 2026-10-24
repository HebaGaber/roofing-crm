# Board match: candidates-triage (Candidate list, Field triage)

Date: 2026-10-25. Started from commit 6d0c9e8 (branch 009-agent-hardening). Build-to-board: neither view existed.

Components (new folders, nothing else edited): `apps/web/src/routes/Map/Candidates/**` (CandidateList, useMapViewParam, bulk create) and `apps/web/src/routes/Map/Triage/**` (TriageStack). Tests: `apps/web/test/candidates/**`, `apps/web/test/triage/**` (46 tests).

How the live side was captured: the components are not mounted in the map yet (the map group owns Map.tsx), so each state was rendered by a throwaway harness page (built with Vite, deleted afterwards) that mounts the real component on the real shared tRPC client with a stubbed fetch returning responses in the real batch wire format. Layout is therefore compared at the component region (list pane, triage panel); the app bar, filters pane, map strip, rail and bottom bar belong to the shell and map groups. Side-by-side PNGs: `/private/tmp/claude-501/-Users-hebagaber-Github-roofing-crm/e699d592-f051-4b7f-9aa2-29f798421a54/scratchpad/board-match/candidates-triage/sbs/`.

## Matrix

| Board | Route + state | Status | Side-by-side | Notes |
|---|---|---|---|---|
| CrmCandidates1440 | /map?view=list, 6 rows | Matched, data differs | CrmCandidates1440.png | Columns, swatch, confidence pill, Lead pill, row actions, Showing footer match. Not in this view: Map+cards/List toggle, Area and Sort menus (map group); "Close n" tab (see Deviations 1). Sort defaults to roof age (no permit filter), as the handoff says. |
| CrmCandidates768 | same | Matched, data differs | CrmCandidates768.png | Basis column hidden below 1240, Permit/Mi/Lat,lon kept. |
| CrmCandidates390 | same | Matched, data differs | CrmCandidates390.png | Checkbox, Address, Roof, Conf., open and why icons. |
| CrmCandidatesConfirm1440 | 3 selected, 2 already leads | Matched, data differs | CrmCandidatesConfirm1440.png | Title "Create n leads?", signals, "Already a lead · {status} · skipped", footnote, Cancel / Create. Count uses the leads the caller owns (see API gap 3). |
| CrmCandidatesConfirm390 | same | Matched, data differs | CrmCandidatesConfirm390.png | Bottom sheet with handle. |
| CrmCandidatesCreated390 | after confirm | Deviation: no Undo | CrmCandidatesCreated390.png | "{n} leads created · {m} already leads" + Open Leads match; Undo omitted, no delete API (Deviations 2). |
| CrmCandidatesEmpty390 | 0 in 0.5 mi | Matched, data differs | CrmCandidatesEmpty390.png | Widen is +1 mi like the map's own rule (1.5, board 1). |
| CrmCandidatesError390 | index down | Matched | CrmCandidatesError390.png | Retry refetches all three queries. |
| CrmCandidatesLoading390 | loading | Matched | CrmCandidatesLoading390.png | Skeleton rows + "Loading candidates from the lead index…". |
| CrmCandidatesNoAddress390 | TCAD title | Matched, data differs | CrmCandidatesNoAddress390.png | Always the live state (no address published). "near {place}" is not on list rows: search.properties carries no place (only property.get does); coordinates shown instead. |
| CrmCandidatesPartial390 | permits unreadable | Matched, data differs | CrmCandidatesPartial390.png | Board shows only the coverage info icon (kept, same popover). A real permit-read failure additionally shows a warning line and "Permits not loaded" per row. |
| CrmCandidatesHide1440 | Hide existing leads on | Matched | CrmCandidatesHide1440.png | "Existing leads hidden (n)", Matches count follows. |
| CrmCandidatesStates | overview | Matched | (each state above) | Loading, empty, error, partial covered. Rate-limited tile is agent-only (no agent call here), not applicable. |
| CrmTriage390 | /map?triage=1 | Matched, data differs | CrmTriage390.png | Header, progress, card, Skip / Create lead / Open details, hint. Contractor line is the "not published" reason, BBB "Not checked" with reason. Map strip and bottom bar belong to map/shell. |
| CrmTriageSwipe390 | mid drag | Matched | CrmTriageSwipe390.png | Rotating card, "Create lead" stamp, commits past 96 px. |
| CrmTriageLead390 | existing lead | Matched | CrmTriageLead390.png | "Already a lead · {status} · {id}" pill, only Skip and Open lead. |
| CrmTriageLoading390 | loading | Matched | CrmTriageLoading390.png | |
| CrmTriageEmpty390 | empty ring | Matched, data differs | CrmTriageEmpty390.png | Widen +1 mi, Roof chip, Back to map. |
| CrmTriageFailed390 | create failed | Matched | CrmTriageFailed390.png | Card stays, error banner with Try again. |
| CrmTriageOffline390 | offline | Matched | CrmTriageOffline390.png | Banner; Create keeps the card with "You’re offline. The lead was not saved."; Skip works. (Icon names show as text in that capture only because the harness blocks its font download while offline.) |
| CrmTriageEnd390 | end of stack | Matched | CrmTriageEnd390.png | "{n} leads created, {m} skipped", Open Leads, Back to map. |
| CrmTriageNoAddress390 | TCAD card | Matched, data differs | CrmTriage390.png | Always the live state; "near {place}" comes from property.get. |
| CrmTriageNoContractor390 | contractor not published | Matched | CrmTriage390.png | Always the live state. |
| CrmTriageStates | overview | Matched | (each state above) | Loading, empty, error, offline; partial (roof unknown) shows the stated reason. |

## Deviations (reasons)

1. **Close n tab** (Matches/Close): needs a close-matches query (properties missing exactly one condition); no such API. Tab omitted, header shows Matches n only.
2. **No Undo for created leads** (list snackbar, triage): `leads` router has create, updateStatus, addNote, get, list; no delete. Skip Undo works (local). Proposed API in the report.
3. **Lead marks cover the caller's own leads** (`leads.list` scope, first 100). A lead owned by a teammate shows no mark; creating it is refused (ALREADY_EXISTS) and counted as "already a lead", so no duplicates ever.
4. Triage create origin is "map" (handoff: origin Map); list bulk create uses "list".

## Rules kept

Atlas tokens only, no hex; every value from search.properties, search.permits, leads.list, property.get; missing data shows its reason; bulk create is sequential with at most 2 in flight (`runBulkCreate`, cap enforced in code and tested); no server or e2e files touched.
