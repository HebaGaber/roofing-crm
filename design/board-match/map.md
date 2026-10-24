# Board match: group "map"

Date: 2026-10-25. Started from commit 6d0c9e8. Method: board and live side by side at the board's
width, the live app built from the working tree and served with every API call stubbed (no AWS, no
sign-in). Side-by-side PNGs are in the coordinator's scratchpad under `board-match/map/sbs/`.

Status is only claimed for boards that were actually compared. Boards marked "Not yet compared"
have no side-by-side yet; they are not claimed as matched.

## What changed in this pass

- **County overview**: below zoom 11 the map shows the whole county as hexagons from
  `search.countyOverview` (design-review-log rows 10 and 69), with the legend saying what is
  covered, what is left out and why, and the run. Opening the map with no centre shows it at once.
- **A dropped pin or GPS fix shows markers**, never the county hexagons, at any zoom (a 5 mi ring on
  a phone fits at zoom 10, which used to hide the radius results under hexagons).
- **Index-down notice** now reads as the board does ("Lead index unavailable ... Your leads and
  notes still open") with a Retry that asks again.
- **Radius card** is one row (label, slider, value, unit) with the caption beneath, as drawn.
- **Legend** scrolls inside its own card instead of growing over the Whole county card.

## Matrix

| Board | Route + state | Status | Side-by-side | Notes |
| --- | --- | --- | --- | --- |
| CrmMap1440 | `/`, county view | Deviation: toolbar features not built | CrmMap1440.png | Whole-county hexagons, chip, legend, zoom column, Layers match. Missing vs board: Map + cards / List toggle, Area and Sort menus, Matches 11 / Close 2 tabs with no centre (no sample rows exist to match), permit clusters appear only where cells carry open or stalled permits. Hexagons look larger than the board because the grid is drawn at the whole-number zoom and the map sits at a fractional one (up to 2x); the board shows 24 px cells. County outline and outside shading deferred: review-log row 9. |
| CrmMap768 | `/`, county view | Deviation: as CrmMap1440 | Not compared in detail | Same components as 1440 at this width. |
| CrmMap390 | `/`, county view | Deviation: as CrmMap1440 | CrmMap390.png | Phone toolbar differs: board has a filter count chip, Map/List toggle, Area and Sort; live has Use my location and Filters. Bottom tabs, search, data chip match. |
| CrmMapPin1440 | pin with 5 mi ring | Matched, data differs | CrmMapPin1440.png | Ring, pin, markers, radius card, three panes, results list. Board result cards are two-line rows with a lead pill; live cards use the published-data layout (TCAD id, "Address not published in this run"), which is the honest form (review-log row 1). |
| CrmMapPin390 | pin with 5 mi ring | Deviation: radius card position | CrmMapPin390.png | Markers now show with the ring. Radius card sits at the top of the map, not the bottom, because the results sheet covers the bottom on phones. Pin explainer toast ("Pin at ... near Pflugerville") not built. |
| CrmMapNoResults390 | zero results | Matched, copy differs | CrmMapNoResults390.png | Widen action present. Board also offers "Roof >= 13 yrs" and a headline "No roofs match within 0.5 mi"; live says "No properties within 5 mi" with Widen to 6 mi. |
| CrmMapIndexDown390 | search fails | Matched | CrmMapIndexDown390.png | Notice copy and Retry now follow the board; it renders in the results sheet, the board draws it as a banner over the map (deviation: placement). Data chip "No index" state is the shell's. |
| CrmMapLocating390 | loading | Matched, data differs | CrmMapLocating390.png | Captured with the results request pending; the board's "Locating" is the GPS lookup, not covered here. See GPS states below. |
| CrmMapPinOutside390 | pin outside county | Not yet compared | pinoutside capture taken | State exists (`CrmMapPinOutside390`). |
| CrmMapTiles390, CrmMapFailed390 | tiles blocked | Not yet compared | tiles-390 capture taken | State exists, e2e covers it (B-01). |
| CrmProperty1440 / 768 / 390 | `sel` drawer | Not compared by me | CrmProperty1440.png, 768, 390 | The drawer is alakazam's (`routes/Map/PropertyDetail/**`), outside my files. Observed: side sheet and full-height sheet structure match. Board shows an address and a lead pill; live shows TCAD id and the missing-address reason (review-log rows 1 and 67). |
| CrmPropertyFailed1440 / 390 | property.get fails | Not compared by me | CrmPropertyFailed*.png | Drawer owner. |
| CrmMapGps1440 / 390 / 768, CrmMapGpsDenied390, GpsExplain390, GpsLow390, GpsOutside390, GpsUnavailable390, CrmGpsStates | GPS flows | Not yet compared | none | Needs geolocation stubs per state in the capture script. |
| CrmMapPinMode1440 / 390, CrmMapPinMove1440 | pin mode, move | Not yet compared | none | |
| CrmMapNoAddress390, CrmMapPartial390, CrmMapStates | map states | Not yet compared | none | |
| CrmPropertyCreated390, Creating390, Dup390, NoAddress1440 / 390, NoContractor390, Partial390, ContractorBadge, PropertyDetail | drawer states | Not compared by me | none | Drawer and lead snackbar belong to other owners. |

## Gaps (what the server or the app lacks)

- Map + cards / List toggle, Area menu, Sort menu, filter count chip, Triage button: no counterparts
  built; Triage belongs to the candidates group.
- Pin explainer toast and the pin and ring chips ("128 in 5 mi", "No permit data in part of this
  ring"): permit coverage areas are not published (review-log row 70).
- County outline and outside shading: review-log row 9.
- Permit clusters in the county view show only cells with counted open or stalled permits; with the
  sample slice that is few, so the board's cluster density is not reproduced.
