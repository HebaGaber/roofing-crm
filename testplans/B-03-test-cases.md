---
id: QC-TC-B-03
type: test-cases
title: "Search a radius for aged roofs and open permits, with full detail"
parent: [FEAT-B03, FEAT-B04, FEAT-B05, FEAT-B06]
story: stories/B-03-map-search.md
spec: specs/003-map-search/spec.md   # FR numbers below are the spec's (FR-001…FR-007, NFR-001)
owner: HebaGaber                     # QC Lead
status: Draft                        # Draft → In Review → Approved
gate: G6
version: 0.1
created: 2026-10-23
updated: 2026-10-23
runtime_url: "https://crm.aldarraj.com (or the 003-map-search Amplify branch preview); never localhost"
reviewed_code: "TBD (set to the branch SHA when the cases run)"
qc_signoff: false
---

# Test Cases: B-03 Search a radius for aged roofs and open permits, with full detail

> **v0.1, 2026-10-23.** Drafted with `developmentsupport-testcases` from the story's Given / When / Then ACs (AC-1 … AC-7), its two edge cases, its Requirements table and the spec's FR-001 … FR-007. `tasks.md` was **not** read. Every case starts from the hosted URL in a private window and logs in as `{TEST_USER}`. Playwright runs against `{RUNTIME_URL}`; `playwright.config.ts` must refuse `localhost`.
>
> **Reused from Task A (A-03 read-path cases).** Four cases are copied with only the data, route and URL changed. Each is tagged `(from A TC-0xx)` in its title, where `TC-0xx` is the A-03 case number (`A-03-TC-0xx`). See § 3.

## 1. Feature overview

A rep drops a pin or uses GPS, sets a search radius from 0.5 to 25 miles, and sees the properties inside it with roof-age, open roofing permit, contractor and BBB detail. The value is that the rep can judge and prioritize candidates without leaving the map, and every value is shown with its basis, or with a stated reason when it is missing.

## 2. Requirement mapping

| Source | Reference | Covered by |
| --- | --- | --- |
| Acceptance criterion | B-03-AC-1 (radius, pin) | TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008 |
| Acceptance criterion | B-03-AC-2 (GPS denied) | TC-009, TC-010 |
| Acceptance criterion | B-03-AC-3 (roof age ≥ 15) | TC-011, TC-012, TC-013 |
| Acceptance criterion | B-03-AC-4 (scale 15 → 25) | TC-014, TC-015 |
| Acceptance criterion | B-03-AC-5 (permits, long-open) | TC-016, TC-017, TC-018 |
| Acceptance criterion | B-03-AC-6 (detail, lineage link) | TC-019, TC-020 |
| Acceptance criterion | B-03-AC-7 (BBB not available) | TC-021, TC-022, TC-023 |
| Edge case | Zero results near Lago Vista (0.5 mi) | TC-006 |
| Edge case | GPS outside Travis County (Williamson) | TC-007 |
| Edge case | Open permit, no contractor resolved | TC-023 |
| Functional requirement | FR-001 (pin or GPS, radius 0.5–25 mi, inside the circle) | TC-001, TC-002, TC-003, TC-004, TC-005 |
| Functional requirement | FR-002 (GPS denied → pin-drop with "location denied") | TC-009, TC-010 |
| Functional requirement | FR-003 (roof-age threshold, default 15, basis and confidence) | TC-011, TC-012, TC-013 |
| Functional requirement | FR-004 (filter over the complete data; 15 → 25 lowers the count) | TC-014, TC-015 |
| Functional requirement | FR-005 (permits longest-open first; "long-open" > 5 years) | TC-016, TC-017, TC-018 |
| Functional requirement | FR-006 (drawer: status, open duration, contractor, lineage link) | TC-019, TC-020 |
| Functional requirement | FR-007 (BBB shown or "BBB rating not available" with reason) | TC-021, TC-022, TC-023 |
| NFR | NFR-001 (end to end p95 < 3 s over the full county) | TC-NF-01 |
| Shared states (no AC of its own; used by AC-1 and AC-3) | Index unreadable, loading, responsive, Atlas tokens | TC-024, TC-025, TC-026 |

## 3. Assumptions

- **Reuse from Task A.** The copied cases come from the A-03 read-path plan in `oracle-property-intelligence-platform-pipeline-travis-tx/testplans/A-03-test-cases.md`:
  - `(from A TC-014)` = `A-03-TC-014` (index missing, invalid or empty), used as TC-024.
  - `(from A TC-024)` = `A-03-TC-024` (progress bar, no empty-table flash), used as TC-025.
  - `(from A TC-NF-02)` = `A-03-TC-NF-02` (p95 < 3 s over 20 runs), used as TC-NF-01.
  - `(from A TC-NF-03)` = `A-03-TC-NF-03` (390 / 768 / 1440, Atlas tokens only), used as TC-026.
  - Not reused: `A-03-TC-029` (empty state) is a Vitest unit check of the permits list in Task A. Its B-03 equivalent is the zero-result edge case, TC-006.
  - The A-03 exact texts (for example `Run index could not be read from this site`) are Task A copy. The B-03 copy is not in the prototype text (see § 10, GAP-2), so TC-024 asserts the **behaviour** and quotes the B-03 text only once the design confirms it.
- **Route names.** The map is `/map` and the permit view is `/map?layer=permits`. The detail drawer opens from a result row. Confirm the exact routes against the build; the cases use `{route}` where they differ.
- **Login.** Task B cases log in as `{TEST_USER}` (environment variable), then reach the Map screen.
- **Prototype.** Screens are in `design/prototype/` (`CrmMap390`, `CrmMapPin390`, `CrmMapGpsDenied390`, `CrmMapGpsOutside390`, `CrmMapNoResults390`, `CrmMapIndexDown390`, `CrmProperty390`, `CrmPropertyNoContractor390`, `CrmPropertyPartial390`). The prototype's visible copy is mostly in its titles. Where a case quotes a message, it uses the wording in the story. Where the story gives only a pattern, the case asserts the pattern and the behaviour.
- **Distance.** "Inside the circle" means the great-circle distance from the pin to the property centroid (`latitude`/`longitude` from the `crm_property` row) is ≤ the radius in miles (haversine, Earth radius 3,958.8 mi). The check is computed in the test from the row values, not from the map drawing.
- **Roof age and permits are not recomputed.** Each value is compared with the `roofAgeYears`, `roofAgeBasis`, `roofAgeConfidence`, `statusClass`, `openDays`, `issueDate` and `contractorResolution` fields of the B-02 index. The test reads them from the index, never from the UI alone.
- **Scale.** The "full index" for AC-4 is the complete `crm_property` index for Travis County. At G6 that index is not yet published (A-11 pending). See GAP-1 in § 10.

## 4. Scope

- **In scope:** the Map screen (pin, GPS, radius, ring), the roof-age filter, the permit layer and its sort, the property detail drawer, the honest missing-data states, the index-unreadable state, loading, responsive layout at 390 / 768 / 1440, and the radius-search latency.
- **Out of scope:** creating or managing leads (B-07); live BBB lookups (the README excludes them); agent-driven search (B-09); the Task A pipeline and its data quality (A-01 … A-11). These are verified only through the published index and Task A's record link.

## 5. Test data

- **Data snapshot.** The B-02 index built from the sample manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` (run `travis-202609-permits-20261021t103516z`) is the build and test slice for this phase. The full-county snapshot replaces it at the data switch (GAP-1). The cases record the snapshot CID in `docs/evidence/B-03.md`.
- **Pflugerville centre.** Pin at 30.4394° N, −97.6200° W, radius 5 mi (TC-001, TC-011, TC-014, TC-016).
- **Lago Vista rural point.** A point near Lago Vista that gives zero properties at 0.5 mi. The test first queries the index and confirms the count is 0. The exact coordinates are recorded in evidence (TC-006).
- **Georgetown centre.** 30.6333° N, −97.6780° W, in Williamson County. The gazetteer returns `out_of_scope` for it (TC-007).
- **Manor property.** A `propertyCid` with an open roofing permit, near Manor. Its `propertyCid`, permit number and open-day count come from the index (TC-019).
- **Edge-distance property.** A `propertyCid` whose centroid is 5.1–5.3 mi from the Pflugerville pin, found by query (TC-004).
- **Boundary-age properties.** One property with `roofAgeYears` = 15 and one with 14, from the snapshot (TC-013).
- **Boundary-open permits.** One permit with `openDays` between 1,800 and 1,900, and one with `openDays` = 1,826 or more, both from the snapshot (TC-017).
- **Missing-data records.** One property with `roofAgeYears` null and a `missingReasons` entry; one open permit with no `issueDate`; one open permit with no contractor resolved; one permit whose BBB rating is not published (TC-012, TC-018, TC-021, TC-023).
- **Published BBB rating.** One permit whose contractor has a published `bbbRating`. The test reads the value from the index (TC-022).
- **Run-scoped values.** None. Every case here is read-only. No leads or other records are created, so no cleanup is needed.

## 6. Environment, risks and dependencies

- `RUNTIME_URL={hosted URL}` (`https://crm.aldarraj.com` or the Amplify preview for `003-map-search`) · test user `{TEST_USER}` (environment variable).
- Playwright geolocation (`context.setGeolocation`, `permissions: ['geolocation']`) and HTTPS are required. Browsers refuse geolocation over plain HTTP, so `localhost` is never valid evidence.
- **Risk:** the 35-row sample slice may hold few or no properties in the 5 mi Pflugerville ring. TC-001 first confirms `N15 > 0` from the index. If it is 0, the case is recorded as blocked by GAP-1, not passed with an empty result.
- **Dependencies:** B-02 merged (lead index, d01c06e). Task A A-13's drawer pattern is reused as copied components, not re-derived.

## 7. Coverage matrix

Coverage includes: happy path, negative, edge, validation, error handling, integration, missing-data, scale, performance and responsive.

| TC ID | Title | Priority | Tags | Type | Requirement(s) | Playwright test |
| --- | --- | --- | --- | --- | --- | --- |
| B-03-TC-001 | Pin at Pflugerville, 5 mi: ring drawn, every result inside | P1 | @smoke @demo | UI | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-001 …"` |
| B-03-TC-002 | Radius 0.4 and 25.5 mi are rejected, no search runs | P1 | @negative @validation | UI | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-002 …"` |
| B-03-TC-003 | Radius 0.5 and 25 mi are accepted, results stay inside | P2 | @edge | UI | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-003 …"` |
| B-03-TC-004 | Property 5.1–5.3 mi away is excluded at 5 mi | P2 | @edge | UI + data | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-004 …"` |
| B-03-TC-005 | GPS granted: centre moves to device location, ring drawn | P1 | @smoke | UI | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-005 …"` |
| B-03-TC-006 | Zero results at 0.5 mi near Lago Vista → "widen to {n} mi" | P1 | @edge @negative | UI | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-006 …"` |
| B-03-TC-007 | GPS in Williamson County → "outside Travis County", no empty map | P1 | @edge @negative | UI | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-007 …"` |
| B-03-TC-008 | Pin dropped in Williamson County → same outside-county state | P2 | @negative | UI | AC-1, FR-001 | `map-search.spec.ts › "B-03-TC-008 …"` |
| B-03-TC-009 | GPS denied → pin-drop mode with "location denied" | P1 | @negative @error | UI | AC-2, FR-002 | `map-search.spec.ts › "B-03-TC-009 …"` |
| B-03-TC-010 | GPS unavailable or timed out → explicit state, pin-drop fallback | P2 | @error | UI | AC-2, FR-002 | `map-search.spec.ts › "B-03-TC-010 …"` |
| B-03-TC-011 | Roof-age default 15: every row ≥ 15, basis and confidence shown | P1 | @smoke @demo | UI + data | AC-3, FR-003 | `map-search.spec.ts › "B-03-TC-011 …"` |
| B-03-TC-012 | Null roof age is excluded from the filter, never shown as 0 | P1 | @missing-data | UI + data | AC-3, FR-003 | `map-search.spec.ts › "B-03-TC-012 …"` |
| B-03-TC-013 | Boundary: age 15 included, age 14 excluded | P2 | @edge | UI + data | AC-3, FR-003 | `map-search.spec.ts › "B-03-TC-013 …"` |
| B-03-TC-014 | Threshold 15 → 25: count lower, both equal the full-index query | P1 | @scale @demo | UI + data | AC-4, FR-004 | `map-search.spec.ts › "B-03-TC-014 …"` |
| B-03-TC-015 | Repeated changes 15 → 25 → 15 → 25: each count checked | P2 | @scale | UI + data | AC-4, FR-004 | `map-search.spec.ts › "B-03-TC-015 …"` |
| B-03-TC-016 | Permit layer: sorted by open days, longest first; long-open badge | P1 | @smoke @demo | UI + data | AC-5, FR-005 | `map-search.spec.ts › "B-03-TC-016 …"` |
| B-03-TC-017 | Badge boundary: 1,800 days no badge, 1,900 days badge | P2 | @edge | UI + data | AC-5, FR-005 | `map-search.spec.ts › "B-03-TC-017 …"` |
| B-03-TC-018 | Permit with no issue date: "not available", sorted last, no badge | P2 | @missing-data | UI + data | AC-5, FR-005 | `map-search.spec.ts › "B-03-TC-018 …"` |
| B-03-TC-019 | Drawer for Manor property: status, open duration, contractor, lineage link | P1 | @smoke @demo | UI | AC-6, FR-006 | `map-search.spec.ts › "B-03-TC-019 …"` |
| B-03-TC-020 | Lineage link resolves to Task A's record for the same CID | P2 | @integration | UI | AC-6, FR-006 | `map-search.spec.ts › "B-03-TC-020 …"` |
| B-03-TC-021 | BBB not published: "BBB rating not available" with reason | P1 | @missing-data @demo | UI + data | AC-7, FR-007 | `map-search.spec.ts › "B-03-TC-021 …"` |
| B-03-TC-022 | Published BBB rating shown verbatim, never reworded or invented | P2 | @integration | UI + data | AC-7, FR-007 | `map-search.spec.ts › "B-03-TC-022 …"` |
| B-03-TC-023 | Open permit, no contractor: "Contractor not available" with reason | P2 | @edge @missing-data | UI + data | AC-7, FR-007 | `map-search.spec.ts › "B-03-TC-023 …"` |
| B-03-TC-NF-01 | Radius + roof-age change: p95 < 3 s end to end, 20 runs (from A TC-NF-02) | P1 | @perf | UI | NFR-001, AC-1, AC-4 | `map-search.perf.spec.ts › "B-03-TC-NF-01 …"` |
| B-03-TC-024 | Index unreadable, invalid or empty → explicit state, no blank map (from A TC-014) | P1 | @negative @error @edge | UI | AC-1, AC-3, FR-001, FR-003 | `map-search.spec.ts › "B-03-TC-024 …"` |
| B-03-TC-025 | Results loading: progress shown, no "no results" flash (from A TC-024) | P1 | @edge | UI | AC-1, AC-3, FR-001 | `map-search.spec.ts › "B-03-TC-025 …"` |
| B-03-TC-026 | Map and drawer at 390 / 768 / 1440, no overflow, Atlas tokens only (from A TC-NF-03) | P1 | @responsive | UI | AC-1, AC-6, Atlas rule | `responsive.spec.ts › "B-03-TC-026 …"` (smeargle) |

Counts: 27 functional and NFR cases. P1: 16. P2: 11. The P1 cases are tagged in § 8.

## 8. Functional test cases

Each case is a complete, ordered sequence starting from the hosted URL, in a private window, logged in as `{TEST_USER}`. Read-only throughout. The expected results name the real values the test reads from the index. "Index" means the B-02 `crm_property` and `crm_permit` tables for the snapshot in § 5.

---

### AC-1 · Radius search from a pin or GPS (FR-001)

#### B-03-TC-001: Pin at Pflugerville, 5 mi ring drawn, every result inside (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-1, FR-001 · demo line D-2
- **Test data:** Pin 30.4394° N, −97.6200° W; radius 5 mi.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` in a private window. → Map screen loads with the Travis County extent.
  2. **Log in** as `{TEST_USER}`. → Map screen is shown.
  3. **Click** the map at 30.4394, −97.6200 (pin drop). → A pin marker is placed; the pin-drop state is shown.
  4. **Set** the radius control to `5` mi. → The map draws one ring of 5.00 mi radius around the pin.
  5. **Read** the result count `N15` (roof-age default is not yet applied; this is the radius-only count). → `N15` is a number ≥ 1 (see § 6 risk).
  6. **Read** the `latitude`/`longitude` of every result row from its `propertyCid` in the index. → Every centroid has great-circle distance ≤ 5.00 mi from the pin.
  7. **Verify** no result row lies outside the drawn ring. → 0 rows outside.
- **Expected result:** a 5.00 mi ring is drawn; `N15 ≥ 1`; every result's distance from the pin is ≤ 5.00 mi, computed from the index centroids. The count shown on screen equals the count of index rows inside the ring.

#### B-03-TC-002: Radius 0.4 mi and 25.5 mi are rejected, no search runs (negative)

- **Priority / tags:** P1 · `@negative @validation`
- **Maps to:** AC-1, FR-001
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` in a private window; **log in** as `{TEST_USER}`.
  2. **Drop** a pin at 30.4394, −97.6200.
  3. **Enter** `0.4` in the radius control and press Enter. → The control rejects the value; the radius stays at its previous value.
  4. **Enter** `25.5` in the radius control and press Enter. → The control rejects the value; the radius stays at its previous value.
  5. **Check** the network log for the search request. → No search request was sent with radius 0.4 or 25.5.
- **Expected result:** both values are rejected at the control; the radius stays at its previous value (default 5 mi unless changed); no request carries 0.4 or 25.5. The rejection shows an inline message naming the 0.5–25 mi range, with its exact copy confirmed against the design (GAP-2).

#### B-03-TC-003: Radius 0.5 mi and 25 mi are accepted, results stay inside (edge)

- **Priority / tags:** P2 · `@edge`
- **Maps to:** AC-1, FR-001
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** a pin at 30.4394, −97.6200.
  2. **Set** the radius to `0.5`. → A 0.5 mi ring is drawn; the count is shown.
  3. **Verify** every result lies within 0.50 mi of the pin (haversine, from index centroids).
  4. **Set** the radius to `25`. → A 25.00 mi ring is drawn; the count is shown.
  5. **Verify** every result lies within 25.00 mi of the pin.
- **Expected result:** both bounds are accepted; each count matches the index rows inside its ring; no result is outside its ring at either bound.

#### B-03-TC-004: A property 5.1–5.3 mi away is excluded at 5 mi (edge)

- **Priority / tags:** P2 · `@edge`
- **Maps to:** AC-1, FR-001
- **Test data:** `propertyCid` = `{EDGE_CID}`, the property found in § 5 whose centroid is 5.1–5.3 mi from the pin.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** a pin at 30.4394, −97.6200; **set** the radius to `5`.
  2. **Search** the result list for `{EDGE_CID}`. → Not present.
  3. **Set** the radius to `6`. → `{EDGE_CID}` is now present.
- **Expected result:** `{EDGE_CID}` is absent at 5 mi and present at 6 mi, matching its index distance (5.1–5.3 mi).

#### B-03-TC-005: GPS granted, centre moves to device location, ring drawn (happy path)

- **Priority / tags:** P1 · `@smoke`
- **Maps to:** AC-1, FR-001 (GPS centre point)
- **Preconditions:** The browser context has `permissions: ['geolocation']` and `setGeolocation({ latitude: 30.4394, longitude: -97.6200 })`.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` in the private window; **log in** as `{TEST_USER}`.
  2. **Click** "Use my location". → The state "GPS: finding your location" is shown briefly.
  3. **Wait** for the location to resolve. → The map centres on 30.4394, −97.6200; the GPS state clears.
  4. **Set** the radius to `5`. → A 5.00 mi ring is drawn around the device location.
  5. **Verify** every result lies within 5.00 mi of 30.4394, −97.6200.
- **Expected result:** the centre is the device location to 4 decimal places; the ring is 5.00 mi; every result is inside it.

#### B-03-TC-006: Zero results at 0.5 mi near Lago Vista → "widen to {n} mi" (edge, zero-result)

- **Priority / tags:** P1 · `@edge @negative`
- **Maps to:** AC-1, FR-001 · story edge case 1
- **Test data:** Rural Lago Vista point `{LAGO_VISTA_POINT}` (in § 5). The index count at 0.5 mi is confirmed as 0 before the run.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** a pin at `{LAGO_VISTA_POINT}`.
  2. **Set** the radius to `0.5`. → The result list is empty for 0.5 mi.
  3. **Read** the empty-state message. → A suggestion reads `widen to {n} mi`, where `{n}` is a number greater than 0.5 that the index confirms gives ≥ 1 result.
  4. **Click** the suggestion. → The radius becomes `{n}`; the result count is ≥ 1.
- **Expected result:** no blank list; the suggestion names a specific wider radius `{n}` (an integer or decimal, > 0.5); after accepting it the count is ≥ 1 and every result is inside the ring.

#### B-03-TC-007: GPS in Williamson County → "outside Travis County", no empty map (edge, negative)

- **Priority / tags:** P1 · `@edge @negative`
- **Maps to:** AC-1, FR-001 · story edge case 2
- **Preconditions:** `setGeolocation({ latitude: 30.6333, longitude: -97.6780 })` (Georgetown, Williamson County), permissions granted.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`.
  2. **Click** "Use my location". → The GPS state resolves.
  3. **Read** the state message. → The message states the position is outside the covered county: "GPS: outside Travis County" (prototype `CrmMapGpsOutside390`), with the wording confirmed against the design (GAP-2).
  4. **Verify** no result list is drawn and no ring is drawn for the outside position.
  5. **Verify** the map is not blank: the basemap tiles and the Travis County boundary are visible.
- **Expected result:** the outside-county state is shown in words; no empty result list; the map shows the county extent, never a blank canvas.

#### B-03-TC-008: Pin dropped in Williamson County → same outside-county state (negative)

- **Priority / tags:** P2 · `@negative`
- **Maps to:** AC-1, FR-001
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`.
  2. **Click** the map at 30.6333, −97.6780 (Georgetown). → A pin is placed.
  3. **Read** the state message. → "Pin outside Travis County" (prototype `CrmMapPinOutside390`), wording confirmed against the design (GAP-2).
  4. **Verify** no result list or ring for the pin.
- **Expected result:** the pin is kept but the outside-county state is shown; no search runs for an outside pin; no blank map.

---

### AC-2 · GPS denied falls back to pin-drop with an explicit state (FR-002)

#### B-03-TC-009: GPS denied → pin-drop mode with "location denied" (happy path of the fallback, negative input)

- **Priority / tags:** P1 · `@negative @error`
- **Maps to:** AC-2, FR-002
- **Preconditions:** Browser context has no `geolocation` permission (denied).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` in a private window; **log in** as `{TEST_USER}`.
  2. **Click** "Use my location". → The browser denial is received; no location is requested.
  3. **Read** the state. → "GPS: location off, drop a pin instead" (prototype `CrmMapGpsDenied390`); the state names the denial as "location denied" in the screen's text.
  4. **Verify** pin-drop mode is active: the map accepts a click to place a pin.
  5. **Verify** the map is not blank (basemap tiles and county boundary visible) and no error is silent (the state is on screen, not only in the console).
- **Expected result:** the explicit "location denied" state is shown; pin-drop mode is active; the map is never blank; no pin is placed without a click.

#### B-03-TC-010: GPS unavailable or timed out → explicit state and pin-drop fallback (error)

- **Priority / tags:** P2 · `@error`
- **Maps to:** AC-2, FR-002
- **Preconditions:** `page.addInitScript` replaces `navigator.geolocation.getCurrentPosition` so that the error callback fires with `code: 2` (POSITION_UNAVAILABLE) in the first case and `code: 3` (TIMEOUT) in the second.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`.
  2. **Click** "Use my location" with the `code: 2` stub. → The unavailable state is shown (prototype `CrmMapGpsUnavailable390`, wording confirmed against the design, GAP-2).
  3. **Repeat** steps 1–2 with the `code: 3` stub. → The timeout state is shown; the pin-drop fallback is active.
  4. **Verify** no silent failure and no blank map in either case.
- **Expected result:** each failure produces its own explicit state on screen and pin-drop fallback; neither produces a blank map or a silent failure.

---

### AC-3 · Roof-age threshold (FR-003)

#### B-03-TC-011: Roof-age default 15 years, every row at least 15, basis and confidence shown (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-3, FR-003 · demo line D-3
- **Test data:** Pin 30.4394, −97.6200; radius 5 mi.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** the pin; **set** the radius to `5`.
  2. **Read** the roof-age control. → Its value is `15 years`.
  3. **Read** the result count `N15`. → `N15 ≥ 1`.
  4. **Read** every result row's roof age, basis and confidence from the UI. → Every row's age is ≥ 15 years; every row shows a basis (a label from the index's `roofAgeBasis` enum) and a confidence (from `roofAgeConfidence`).
  5. **Compare** the set of `propertyCid`s on screen with the index query `roofAgeYears >= 15` inside the 5 mi ring. → The sets are equal.
- **Expected result:** the default is 15; `N15` equals the index count; every row shows its real `roofAgeYears` (≥ 15), its `roofAgeBasis` and its `roofAgeConfidence` exactly as stored.

#### B-03-TC-012: Null roof age is excluded from the filter, never shown as 0 (missing data)

- **Priority / tags:** P1 · `@missing-data`
- **Maps to:** AC-3, FR-003
- **Test data:** `{NULL_AGE_CID}`, a property inside the 5 mi ring with `roofAgeYears` null and a `missingReasons` entry (§ 5).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** the pin; **set** the radius to `5`; roof-age threshold at 15.
  2. **Search** the list for `{NULL_AGE_CID}`. → Not present in the ≥ 15 list.
  3. **Set** the threshold to `0` (the filter is off, if the control allows 0; otherwise skip to step 5). → `{NULL_AGE_CID}` may appear.
  4. **Read** its row. → The roof age reads "not available" with the reason text for its `missingReasons` code. It does **not** read `0`, blank or `null`.
- **Expected result:** the record is excluded from the ≥ 15 result set; where it appears, it shows "roof age not available" plus its stated reason, never `0`, blank or `null`.

#### B-03-TC-013: Boundary: age 15 included, age 14 excluded (edge)

- **Priority / tags:** P2 · `@edge`
- **Maps to:** AC-3, FR-003
- **Test data:** `{AGE15_CID}` with `roofAgeYears` = 15; `{AGE14_CID}` with `roofAgeYears` = 14; both inside the 5 mi ring.
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** the pin; **set** the radius to `5`; threshold at 15.
  2. **Search** for `{AGE15_CID}`. → Present, with roof age 15.
  3. **Search** for `{AGE14_CID}`. → Absent.
- **Expected result:** the threshold is inclusive at 15: age 15 is shown, age 14 is hidden.

---

### AC-4 · Scale: the filter runs over the full index (FR-004)

#### B-03-TC-014: Threshold 15 → 25 lowers the count; both equal the full-index query (scale, happy path)

- **Priority / tags:** P1 · `@scale @demo`
- **Maps to:** AC-4, FR-004 · demo line D-3 · spec SC-002
- **Test data:** Pin 30.4394, −97.6200; radius 5 mi. The reference count is a direct query of the complete `crm_property` index for the same inputs (run by the QC Lead in DuckDB against the snapshot in § 5; the query and its result are saved to `docs/evidence/B-03.md`).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** the pin; **set** the radius to `5`.
  2. **Set** the roof-age threshold to `15`. → Read the visible count `N15`.
  3. **Set** the threshold to `25`. → Read the visible count `N25`.
  4. **Verify** `N25 < N15`.
  5. **Run** the reference query: rows in the complete index with distance ≤ 5 mi and `roofAgeYears >= 15`, then `>= 25`. → `R15` and `R25`.
  6. **Verify** `N15 = R15` and `N25 = R25`.
- **Expected result:** `N25 < N15` strictly; `N15 = R15` and `N25 = R25` where `R` is the full-index count for the same inputs; the counts and the snapshot CID are written to `docs/evidence/B-03.md`. Any count that does not match fails the case; a count of 0 at 25 with `N15 > 0` still satisfies `N25 < N15` and must match `R25`.

#### B-03-TC-015: Repeated changes 15 → 25 → 15 → 25, each count checked (scale)

- **Priority / tags:** P2 · `@scale`
- **Maps to:** AC-4, FR-004 · spec SC-002
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** the pin; **set** the radius to `5`.
  2. **Set** the threshold to `15`, then `25`, then `15`, then `25`. After each change, read the visible count and the reference count (as in TC-014).
  3. **Verify** each count equals its reference count, and that the count changes on each change of threshold.
- **Expected result:** the four counts are `N15, N25, N15, N25`; each equals its reference; the count is never stale after a change (the same value returns when the threshold returns to 15).

---

### AC-5 · Permit layer, longest-open first (FR-005)

#### B-03-TC-016: Permit layer sorted by open days, longest first; "long-open" badge (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-5, FR-005 · demo line D-4
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** the pin; **set** the radius to `5`.
  2. **Switch** to the permit layer. → The permit list is shown for the radius.
  3. **Read** `openDays` for every row, top to bottom. → The sequence is non-increasing (each row's days ≥ the next).
  4. **Read** the first row. → Its `openDays` is the maximum in the list.
  5. **Verify** every row with `openDays > 1,825` (more than 5 years) shows a "long-open" badge, and no row with `openDays ≤ 1,825` shows one.
- **Expected result:** the list is sorted by open days, longest first, over every row (not only the first); the first row is the longest-open permit in the radius; the badge appears exactly on permits open more than 5 years.

#### B-03-TC-017: Badge boundary: 1,800 days no badge, 1,900 days badge (edge)

- **Priority / tags:** P2 · `@edge`
- **Maps to:** AC-5, FR-005
- **Test data:** `{PERMIT_1800}` with `openDays` = 1,800 and `{PERMIT_1900}` with `openDays` = 1,900, both in the radius (§ 5).
- **Steps:**
  1. **Open** the permit layer for the same radius.
  2. **Find** `{PERMIT_1800}`. → No "long-open" badge.
  3. **Find** `{PERMIT_1900}`. → "long-open" badge is shown.
- **Expected result:** a permit at 1,800 days has no badge; a permit at 1,900 days has the badge.

#### B-03-TC-018: Permit with no issue date → "not available", sorted last, no badge (missing data)

- **Priority / tags:** P2 · `@missing-data`
- **Maps to:** AC-5, FR-005
- **Test data:** `{NO_ISSUE_PERMIT}`, an open permit in the radius with `issueDate` null (§ 5).
- **Steps:**
  1. **Open** the permit layer for the same radius.
  2. **Find** `{NO_ISSUE_PERMIT}`. → Its open duration reads "not available" with the reason text for its missing-data code.
  3. **Verify** it is ordered after every row that has a number of open days.
  4. **Verify** it has no "long-open" badge.
- **Expected result:** the open duration reads "not available" with its reason, never `0` or blank; the row is last; no badge.

---

### AC-6 · Property detail drawer and the lineage link (FR-006)

#### B-03-TC-019: Drawer for a Manor property shows status, open duration, contractor and lineage link (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-6, FR-006 · demo line D-5
- **Test data:** `{MANOR_CID}`, a property near Manor with an open roofing permit `{MANOR_PERMIT}` (§ 5).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`.
  2. **Centre** the map on Manor (or drop a pin at `{MANOR_CID}`'s centroid) and **open** the permit layer.
  3. **Click** `{MANOR_PERMIT}`'s row. → The detail drawer opens.
  4. **Read** the drawer. → Status reads the index's `statusClass` for `{MANOR_PERMIT}` as a label; open duration reads its `openDays` as a number of days; contractor reads the contractor's name from `contractorResolution`.
  5. **Find** the link "View lineage in Explorer". → Present in the drawer.
- **Expected result:** the drawer shows the permit's status, its `openDays`, the contractor's name as stored, and the "View lineage in Explorer" link. None of these fields is blank.

#### B-03-TC-020: The lineage link resolves to Task A's record for the same CID (integration)

- **Priority / tags:** P2 · `@integration`
- **Maps to:** AC-6, FR-006
- **Steps:**
  1. **From** the drawer of `{MANOR_CID}` (B-03-TC-019), **read** the href of "View lineage in Explorer".
  2. **Verify** the href contains `{MANOR_CID}` (the `propertyCid`) and points to Task A's published Explorer host.
  3. **Click** the link. → A new tab opens to the Explorer record.
  4. **Verify** the record shows the same `propertyCid` and its published manifest CID.
- **Expected result:** the href carries the property's CID; the record opens and shows the same CID; the link is not a broken or generic page.

---

### AC-7 · BBB rating, or an honest "not available" with a reason (FR-007)

#### B-03-TC-021: BBB not published → "BBB rating not available" with reason (missing data, happy path of the honesty rule)

- **Priority / tags:** P1 · `@missing-data @demo`
- **Maps to:** AC-7, FR-007 · demo line D-5
- **Test data:** `{NO_BBB_PERMIT}`, an open permit whose contractor has no published `bbbRating` (§ 5).
- **Steps:**
  1. **Open** the permit layer for the radius containing `{NO_BBB_PERMIT}`.
  2. **Click** its row. → The detail drawer opens.
  3. **Find** the BBB field under the contractor. → It reads exactly `BBB rating not available`, followed by the reason, which names the missing published rating from its `missingReasons` code.
  4. **Verify** the field is not blank, is not `0`, `N/A` or `—`, and no rating value appears.
- **Expected result:** the field reads `BBB rating not available` with its stated reason; no rating, no blank field, no invented value.

#### B-03-TC-022: A published BBB rating is shown verbatim (integration)

- **Priority / tags:** P2 · `@integration`
- **Maps to:** AC-7, FR-007
- **Test data:** `{BBB_PERMIT}`, an open permit whose contractor has a published `bbbRating` (§ 5). Its value is read from the index.
- **Steps:**
  1. **Open** the drawer for `{BBB_PERMIT}`.
  2. **Read** the BBB field. → The value shown equals the index's `bbbRating` for that contractor, byte for byte.
  3. **Verify** the field does not show "BBB rating not available".
- **Expected result:** the drawer shows the published rating exactly as stored, with no rewording and no "not available" label.

#### B-03-TC-023: Open permit with no contractor → "Contractor not available" with reason (edge, missing data)

- **Priority / tags:** P2 · `@edge @missing-data`
- **Maps to:** AC-7, FR-007 · story edge case 3
- **Test data:** `{NO_CONTRACTOR_PERMIT}`, an open permit with no `contractorResolution` (§ 5).
- **Steps:**
  1. **Open** the drawer for `{NO_CONTRACTOR_PERMIT}`.
  2. **Read** the contractor field. → It reads "Contractor not available" with the reason text for its missing-data code (prototype `CrmPropertyNoContractor390`, wording confirmed against the design, GAP-2).
  3. **Verify** the BBB field reads "BBB rating not available" with a reason, because no contractor is resolved.
- **Expected result:** neither the contractor nor the BBB field is omitted or blank; each states that it is not available and why.

---

### NFR · Latency (NFR-001)

#### B-03-TC-NF-01: Radius and roof-age change, p95 < 3 s end to end, 20 runs (from A TC-NF-02, performance)

- **Priority / tags:** P1 · `@perf`
- **Maps to:** NFR-001, AC-1, AC-4 · (from A TC-NF-02)
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; wait until the index is ready (no progress state visible).
  2. **Run** one untimed warm-up: drop the pin, set the radius to `5`, set the threshold to `15`, read the result count.
  3. **Time** 20 runs of "set the threshold to 25, then to 15" with `performance.now()`, from the change event until the visible count updates. Record each run.
  4. **Compute** p50 and p95 over the 20 timings, separately for the radius change (5 mi → 25 mi) and the threshold change.
- **Expected result:** each of the two p95 values is < 3,000 ms on the hosted URL over the full county; the 40 timings and their p50 / p95 are saved to `docs/evidence/B-03.md`. If the index is still the sample slice, the timings are recorded and the case stays open until the full-county run (GAP-1).

---

### Shared states (cross-AC)

#### B-03-TC-024: Index unreadable, invalid or empty → explicit state, no blank map (from A TC-014, error)

- **Priority / tags:** P1 · `@negative @error @edge`
- **Maps to:** AC-1, AC-3, FR-001, FR-003 · (from A TC-014)
- **Steps:**
  1. **Route** the index request (`{INDEX_URL_PATTERN}`, the `crm_property` index file) to `route.fulfill({ status: 404 })`. **Open** `{RUNTIME_URL}/map` in a private window; **log in** as `{TEST_USER}`. → An explicit error state names the index as unavailable: the exact copy from the design `CrmMapIndexDown390`, confirmed against the design (GAP-2). No map results, no empty card, no placeholder result.
  2. **Repeat** with `route.fulfill({ status: 200, body: '{not json' })`. → The same error state.
  3. **Repeat** with `route.fulfill({ status: 200, body: '{"foo":1}' })` (schema mismatch). → The same error state.
  4. **Verify** the navigation still works and the permit layer is reachable.
- **Expected result:** the same explicit error state in all three cases; never a blank page, an empty card or a placeholder result; the navigation still works.

#### B-03-TC-025: Results loading shows a progress indicator, no "no results" flash (from A TC-024, edge)

- **Priority / tags:** P1 · `@edge`
- **Maps to:** AC-1, AC-3, FR-001 · (from A TC-024)
- **Steps:**
  1. **Delay** the index request by 2 s (Playwright `route` delay, under the 4 s fallback threshold).
  2. **Open** `{RUNTIME_URL}/map`; **log in** as `{TEST_USER}`; **drop** the pin; **set** the radius to `5`.
  3. **Verify** a progress indicator (`role="progressbar"`, accessible name `Loading results`, `aria-valuetext` = the stage text) is visible while the results load.
  4. **Record** every DOM state until results render (MutationObserver). → No "no results" state and no zero-row list appear at any point while loading.
- **Expected result:** the progress indicator shows until results render; the "widen to {n} mi" empty state (TC-006) never appears while loading; no zero-row list.

#### B-03-TC-026: Map and drawer at 390 / 768 / 1440, no overflow, Atlas tokens only (from A TC-NF-03, responsive)

- **Priority / tags:** P1 · `@responsive`
- **Maps to:** AC-1, AC-6 · Atlas UI rule · (from A TC-NF-03)
- **Steps:**
  1. **Open** `{RUNTIME_URL}/map` and open the detail drawer for `{MANOR_CID}`'s permit, at widths 390, 768 and 1440, light theme (`colorScheme: 'light'`).
  2. **Verify** no horizontal page scroll (`scrollWidth ≤ innerWidth`); tap targets ≥ 48 px at 390.
  3. **Verify** the computed colours, font families, spacing (margin, padding, gap) and border radii come only from Atlas tokens: smeargle builds the allowed value set once per width from the `:root` custom properties of `tokens.css`, plus `0`, `auto`, `inherit`, `transparent` and `currentColor`, and lists every `getComputedStyle` value outside the set with its selector and property.
  4. **Capture** a screenshot per width, for the map and for the drawer.
  5. **Verify** the first provenance line of the drawer is inside the first viewport at 390.
- **Expected result:** six screenshots, no overflow, zero non-token values, the drawer's provenance line visible at 390. (Task A's "cards at 390 and table at 768 / 1440" assertion is not copied: B-03 has no data table. The check is adapted to the map and the drawer, nothing else.)

---

## 9. Edge cases

- **Zero results near Lago Vista (0.5 mi)** → "widen to {n} mi" suggestion, not a blank list (TC-006).
- **GPS outside Travis County (Williamson)** → "outside Travis County" state, no empty map (TC-007).
- **Open permit with no contractor resolved** → "Contractor not available" with reason, not omitted (TC-023).
- **Roof-age and permit filters applied together with the radius** → the result set narrows by all active filters at once; covered by TC-011 and TC-016 on the same radius.

## 10. Gap-linked cases (expected to fail or stay open until fixed)

| TC ID | Asserts | Gap | Defect |
| --- | --- | --- | --- |
| B-03-TC-014, B-03-TC-015 | `N25 < N15` and both equal the full-index query on the **full county** | GAP-1: the full-county index is not published (A-11 pending); the sample slice is 35 rows of Austin permits, so the Pflugerville ring may be too small to show a change | none yet |
| B-03-TC-NF-01 | p95 < 3 s over the full county | GAP-1 (same dependency) | none yet |
| B-03-TC-001, B-03-TC-004, B-03-TC-011, B-03-TC-016 | Non-empty results in the 5 mi Pflugerville ring | GAP-1: the sample may hold no properties in the ring; if so the case is blocked, not passed | none yet |
| B-03-TC-002, B-03-TC-006, B-03-TC-007, B-03-TC-008, B-03-TC-009, B-03-TC-010, B-03-TC-021, B-03-TC-023, B-03-TC-024 | Exact on-screen copy ("widen to {n} mi", "outside Travis County", "location denied", "BBB rating not available", the index-down text) | GAP-2: the prototype carries these as titles, not body copy. Each case asserts the wording given in the story or the prototype title; the exact strings are confirmed against the design before G7 | none yet |

## 11. Execution log (filled in Phase 5)

| TC ID | Run date | Build (sha) | Result | Evidence | Defect |
| --- | --- | --- | --- | --- | --- |
| B-03-TC-001 | — | — | not run | — | — |

---

## Gate G6: Test Case Approval

| # | Criterion | Status |
| --- | --- | --- |
| G6-1 | Every AC and every FR maps to at least one TC (§ 2 and § 7) | ☑ (AC-1 … AC-7; FR-001 … FR-007; NFR-001) |
| G6-2 | Happy, negative, edge and missing-data paths covered | ☑ |
| G6-3 | NFRs have test cases with measurable pass criteria | ☑ (TC-NF-01: p95 < 3,000 ms, 20 runs) |
| G6-4 | Every case is a complete sequence starting from the hosted URL | ☑ (§ 1 and every case; localhost refused in config) |
| G6-5 | Negative cases state the exact message or rejection behavior | ☐ partial: exact copy for 'widen', 'outside county', 'BBB not available' is in the story; the rest awaits design confirmation (GAP-2) |
| G6-6 | Test data and environment documented, with real records | ☑ with GAP-1: the snapshot CID is named; the specific record CIDs are filled from the snapshot before the run |
| G6-7 | Every TC traces to the story and a requirement | ☑ |
| G6-8 | AI pre-check (`developmentsupport-g6-precheck`): PASS | ☐ not yet run |

**Decision:** ☐ Approved ☐ Returned, reason: {…} · {date}
