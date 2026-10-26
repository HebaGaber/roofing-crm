# Design attribute audit: property rows, drawer, permit cards, owner, Why panel

Sources: `design/docs/CRM-HANDOFF.md` section 4.3, `design/prototype/PropertyDetail.dc.html`,
`Explore1440.dc.html` (Why view), boards CrmProperty*. Status is checked against `apps/web/src`
and `packages/oracle-contract/src/columns.ts`.

Status key: **Shown**; **Shown now** (added by this change); **Blocked on Run 3.1** (Task A must
publish it); **Not in published data** (contract reason named); **Design only** (needs a decision).

## Property row and card (collapsed and expanded)

| Design attribute                              | Status                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Street address, city, ZIP                     | Blocked on Run 3.1 (`unnormalized_address`, `city_name`, `postal_code`: `not_in_export`) |
| TCAD id (shown in place of the address)       | Shown                                                                                    |
| Distance and bearing from the pin             | Shown                                                                                    |
| Roof age, basis, confidence                   | Shown (pill pair on the collapsed row; cells when expanded)                              |
| Roof age missing, with its reason             | Shown                                                                                    |
| Year built on the basis line                  | Shown now (expanded card, drawer, Why rule; `structureBuiltYear`)          |
| Permit chip (class, open years, derived word) | Shown                                                                                    |
| Source's own permit status word               | Not in published data (`status_raw`: `no_lexicon_carrier`; stalled is derived)           |
| Out-of-area owner pill                        | Design only for the row (`ownerIsOutOfArea` is carried, only used by filters)            |
| Lead pill, checkbox, Hide existing leads      | Shown (Leads and Candidates)                                                             |
| Source record link                            | Shown now (expanded card provenance line, https only)                                    |

## Property drawer

| Design attribute                                          | Status                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Header: address, city, ZIP                                | Blocked on Run 3.1 (shows "Address not published in this run")             |
| Create lead, Open lead, lineage link, Ask about it        | Shown                                                                      |
| Roof: age, confidence, basis                              | Shown                                                                      |
| Roof basis "Year built 1995"                              | Shown now (when basis is built_year and the year exists)                   |
| Evidence chain (reroof permit, CID, copy)                 | Design only (the Roof rule in the Why panel carries source, run, CID)      |
| "Reroof permit not counted: never finaled" note           | Design only                                                                |
| Street View / imagery                                     | Design only (no imagery in the contract; "coming soon" in the design)      |
| Owner name, kind                                          | Shown                                                                      |
| Owner mailing location (city, state, ZIP)                 | Blocked on Run 3.1 (`owner_mailing_postal_code`, `_state_code`)            |
| Owner area (in county, regional, out of area)             | Shown; unknown carries its reason. Blocked on Run 3.1 for most rows        |
| Last sale                                                 | Shown now (year; reason `no_dated_sale` when null)                         |
| Tenure "22 yrs"                                           | Shown now (reason `no_dated_sale` when null); tenure basis line kept       |
| Owner merged from N records                               | Design only (no merge data in the contract)                                |
| Location: coordinates, coordinate source                  | Shown                                                                      |
| Metadata: source, captured date, run, CID per field       | Shown (licence column is design only)                                      |
| "source record" link in provenance                        | Shown now (`sourceUrl`, https only; stated reason when absent)             |
| Similar properties                                        | Design only                                                                |
| Show on map, Open field meanings in the catalog           | Design only                                                                |

## Permit cards

| Design attribute                              | Status                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Permit number, status class, work type        | Shown                                                                                    |
| Issue date, open duration                     | Shown                                                                                    |
| Source's own status word ("source says ...")  | Not in published data (`status_raw`: `no_lexicon_carrier`)                               |
| Expiry date                                   | Not in published data (`expiry_date`: `no_lexicon_carrier`)                              |
| Description, work class as printed            | Not in published data (`description`, `work_class_raw`: `no_lexicon_carrier`)            |
| Close date, final inspection date             | Not in published data (0 of 15,025 on Run 3, always `source_missing`)                    |
| Contractor as printed, with badge             | Shown (reason shown when unpublished)                                                    |
| BBB state                                     | Shown; rating Not in published data (`bbb_rating`: `bbb_blocked`)                        |
| BBB search link                               | Shown (https only)                                                                       |
| "Source: Austin permits {number}" link        | Shown now (`sourceUrl`, https only; stated reason when absent)                           |
| Create lead from this permit                  | Shown                                                                                    |

## Why panel

| Design attribute                                  | Status                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Rules with value, source, run, CID                | Shown                                                        |
| Roof rule: basis, year built, confidence          | Shown (year built is new)                                    |
| Permit rule with "source says {word}"             | Not in published data (`status_raw`); derived class is shown |
| Coordinates, bearing, OpenStreetMap link          | Shown                                                        |
| "source record" link on Coordinates               | Shown now (https only)                                       |
| Verify CID, Details, Back to results              | Shown                                                        |

## Other design-only items noted

Save search, lead-status outlines on markers, Street View and Similar properties need a product
decision before any build. They have no data behind them in the contract.

## Roof-age confidence audit

Confidence is shown beside every roof age in: collapsed and expanded result rows, the drawer Roof
section, the Why panel roof rule, the triage card, candidate rows, candidate summary text and the
leads table when the lead stored it. Two gaps remain and need changes outside this change's files:

- Lead detail shows "Confidence: not saved with the lead" (a stated reason). The lead snapshot
  (`LeadCreateAction.tsx`, `agent.ts` signals) does not store `roofAgeConfidence`.
- The Ask agent's row text (`askCopy.ts` `rowRoofText`) shows age and basis without confidence;
  the agent row type does not carry it.
