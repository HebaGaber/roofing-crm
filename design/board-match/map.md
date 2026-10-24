# Board match: group "map"

Date: 2026-10-25. Started from commit 6d0c9e8; second pass after the overview commit. Method: board
and live side by side at the board's width, the live app built from the working tree and served with
every API call and the browser's geolocation stubbed (no AWS, no sign-in). Side-by-side PNGs are in
the coordinator's scratchpad under `board-match/map/sbs/`.

Status is only claimed for boards that were actually compared. A board marked "Not mine" belongs to
another owner's files; "Not built" is a feature the CRM does not have yet.

## What changed

First pass:

- **County overview**: below zoom 11 the map shows the whole county as hexagons from
  `search.countyOverview` (review-log rows 10 and 69), with the legend saying what is covered, what
  is left out and why, and the run.
- **A dropped pin or GPS fix shows markers**, never the county hexagons, at any zoom.
- Index-down notice with the board's copy and a Retry; radius card as one row; legend scrolls inside
  its card.

Second pass:

- **First-visit "What can I ask?" card** (HANDOFF section 4.10): `components/Onboarding/**`. One
  dismissible, non-modal dialog over the map. One line on what the data is (Task A's published
  Travis County run: roof age, permits, contractors where published; addresses and BBB ratings are
  not published). Three example questions, verbatim from the golden queries G1, G3 and G4
  (`tests/agent/golden.json`); each opens `/ask?q=...` with the question prefilled, never run.
  Close, Got it and Escape dismiss; focus moves into the card; dismissal is kept in localStorage
  under `crm.whatCanIAsk.v1` (every access in try/catch; the page works without storage);
  `?first=1` forces it open; `openWhatCanIAsk()` and the window event `crm:open-what-can-i-ask`
  reopen it. Mounted in `routes/Map/Map.tsx`.
- **GPS states** are cards at the top of the map with the board's words and actions: locating
  (spinner), located with accuracy ("You are here (±12 m). The 5 mi ring centres on you."), low
  accuracy (over 500 m, with Drop pin), denied (Drop pin), unavailable or timed out (Drop pin, Try
  again), outside the county (Go to Travis County). The accuracy circle is drawn on the map and the
  radius caption follows the source ("Your location (GPS)", "Your location (approximate)").
- **Pin mode**: a Drop pin control in the map controls; the board's card ("Click the map where you
  want the search centre. You can drag the pin afterwards." from 840 px; a fixed crosshair and
  "Place pin here" below it). The pin is draggable; dragging it re-centres the search.
- **Pin outside the county** is a card on the map with Go to Travis County (the pin and ring stay).
- **Tile failure** is a banner ("Map unavailable, results below. ...") with Retry, so the radius,
  filters and results stay usable.

Third pass (candidates and triage mounted):

- **Candidate list** (`view=list`): mounted in `Map.tsx` in the map's place, under the toolbar below
  840 px and across the centre and results panes from 840 px (board CrmCandidates1440 / 768 / 390).
  It gets the map's own filters (centre, radius, roof age, permit status, permit open years); an
  outside-county pin is never a centre, as for the map's search. Show on map returns to the map with
  that property open in one URL update. Its empty-state actions change the map's radius and roof
  filters.
- **Field triage** (`triage=1`): mounted in place of the results sheet, docked at the bottom at a
  fixed share of the page so a strip of the map stays above it and the card scrolls inside (Skip,
  Create lead and Open details stay on screen). The current card's roof marker is ringed on the map
  (`is-tri`). A filled "Triage n" button sits in the phone results sheet header (not from 840 px).
- **Toolbar**: the "Map + cards | List" toggle (board CrmMap1440 and CrmMap390): in the toolbar row on
  phones as two icons (the words stay in the accessible name), in a bar above the map from 840 px;
  and the Filters chip on phones is the sliders icon plus the match count, as drawn. The phone toolbar
  is one row, as the board's.

## Matrix

| Board | Route + state | Status | Side-by-side | Notes |
| --- | --- | --- | --- | --- |
| Welcome1440 / 768 / 390 | `/?first=1` | Matched, data differs | Welcome1440, Welcome768, Welcome390 | Card position (16 px in from the map's left at 1440, x 96 at 768, full width at 390), header, intro line, three rows, Got it. The boards are the CountyLens shell; only the card is compared. Intro line and questions differ on purpose: the CRM's data and the golden queries. |
| CrmMap1440 | `/`, county view | Deviation: Area, Sort not built | CrmMap1440 | Whole-county hexagons, chip, legend, controls and the Map + cards / List toggle match. Area and Sort menus, Matches and Close tabs with no centre: not built. Hexagon size can look up to 2x the board's (drawn at the whole-number zoom). County outline: review-log row 9. |
| CrmMap768 | `/`, county view | Deviation: as 1440 | CrmMap768 (first pass) | Same components. |
| CrmMap390 | `/`, county view | Deviation: Area, Sort not built | CrmMap390 | Phone toolbar: Use my location, Filters chip with count, Map/List toggle (board: filter count chip, toggle, locate chip, Area, Sort). |
| CrmMapPin1440 | pin, 5 mi ring | Matched, data differs | CrmMapPin1440 | Result cards use the honest published-data layout (review-log row 1). |
| CrmMapPin390 | pin, 5 mi ring | Deviation: radius card position, explainer toast | CrmMapPin390 | Toolbar, results sheet header with Matches, coverage info and the filled Triage n match. Radius card at the top, not the bottom (the results sheet covers the bottom on phones). Pin explainer toast not built. |
| CrmMapPinMode1440 | pin mode | Matched | CrmMapPinMode1440 | Card, Cancel, pressed control. |
| CrmMapPinMode390 | pin mode | Matched, one deviation | CrmMapPinMode390 | Crosshair, Place pin here, Cancel. The board also says a long-press drops the pin: not built, so the card does not claim it. |
| CrmMapPinMove1440 | drag the pin | Matched in behaviour | none (a drag, not a state) | The pin is draggable and re-centres the search. Not captured as an image. |
| CrmMapPinOutside390 | pin outside the county | Deviation: pin does not snap back | CrmMapPinOutside390 | Card and Go to Travis County match. The board returns the pin to its last spot inside the county; live keeps the pin where it was dropped and runs no search (the sheet says so). |
| CrmMapGps390 | GPS fix | Matched | CrmMapGps390 | Card, copy, close, accuracy and caption. |
| CrmMapGps768, CrmMapGps1440 | GPS fix | Matched | CrmMapGps768, CrmMapGps1440 | Same card. |
| CrmMapGpsLow390 | low accuracy | Matched | CrmMapGpsLow390 | Copy, Drop pin, close, "Your location (approximate)". |
| CrmMapGpsDenied390 | denied | Matched | CrmMapGpsDenied390 | |
| CrmMapGpsUnavailable390 | unavailable or timed out | Matched | CrmMapGpsUnavailable390 | Drop pin and Try again. |
| CrmMapGpsOutside390 | fix outside the county | Matched | CrmMapGpsOutside390 | Go to Travis County shows the county and leaves the pin. |
| CrmMapLocating390 | locating | Matched | CrmMapLocating390 | Spinner card (reduced motion stops the spin). |
| CrmMapGpsExplain390 | explain first | Deferred: would break e2e | none | A card before the browser prompt (Continue, Not now). It adds a step the B-03 e2e (AC-2 denied and outside flows) does not expect and `tests/e2e/**` is not mine to change. Proposal: add it, with the e2e clicking Continue, when the e2e owner agrees. |
| CrmGpsStates | overview of the above | Matched | none | Every card on it is built except Explain first. |
| CrmMapNoResults390 | zero results | Matched, copy differs | CrmMapNoResults390 | Widen action present; board also offers "Roof >= 13 yrs". |
| CrmMapIndexDown390 | search fails | Matched, placement differs | CrmMapIndexDown390 | Copy and Retry match; it sits in the results sheet where the board draws a banner. |
| CrmMapTiles390 | tiles loading | Not compared | tiles-390 capture only | Loading state of tiles is MapLibre's own. |
| CrmMapFailed390 | tile failure | Matched, one deviation | CrmMapFailed390 | Banner, copy, Retry. The board shows the results as a list below (List view, not built); live keeps the map and the sheet. |
| CrmMapPartial390 | permit coverage gap | Deferred: no data | none | The board says which jurisdictions have permits. Task A publishes no coverage areas (review-log row 70), so the CRM cannot say it. The hatched "no permit data" areas and the ring chip are the same gap. |
| CrmMapNoAddress390 | no address in a result | Not mine | none | Result rows and the drawer carry this (`ResultRow`, drawer owners). Live shows the missing-address reason. |
| CrmMapStates | overview | Matched | none | Loading, empty, error, rate-limited and GPS cards: the first four exist (`CrmMapLoading390`, no results, index down, tiles failed); the rate-limited gateway note is not built. |
| CrmProperty1440 / 768 / 390 | `sel` drawer | Not mine | CrmProperty1440, 768, 390 (first pass) | The drawer is `routes/Map/PropertyDetail/**`. Structure matches; address and lead pill differ for the honest reason (review-log rows 1 and 67). |
| CrmPropertyFailed1440 / 390, CrmPropertyNoAddress1440 / 390, CrmPropertyNoContractor390, CrmPropertyPartial390, PropertyDetail, ContractorBadge | drawer states and components | Not mine | CrmPropertyFailed images only | Drawer owner. |
| CrmPropertyCreated390, Creating390, Dup390 | lead creation states | Not mine | none | `LeadCreateAction` and the lead snackbar belong to the leads group. |

| CrmCandidates1440 / 768 / 390 | `view=list` | Matched, data differs | CrmCandidates1440, 768, 390 | The component is the candidates group's (their record: design/board-match/candidates-triage.md); here it is the mounting: toggle, filters, placement, Show on map. The board's Area and Sort menus and Close tab are not built. |
| CrmTriage390 | `triage=1` | Matched, data differs | CrmTriage390 | Dock, card, Skip, Create lead, Open details, ringed marker. Contractor and BBB lines show the published reason. |

## Gaps

- Area and Sort menus (the list's Sort is the list's own default: roof age, or permit open with a
  permit filter), the Close tab (no close-matches API).
- Pin explainer toast, in-ring chips, hatched no-permit areas (no coverage data), pin snap-back,
  long-press to drop a pin, GPS Explain first (see above), rate-limited gateway note.
- County outline and outside shading: review-log row 9.
- The Ask route must read the `q` query param to prefill its box; until it does the example links
  open Ask with an empty box.
