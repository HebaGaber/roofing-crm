// The single place for data-dependent values in the hosted end-to-end suite. Every value here was
// read from the REAL served index, never invented, and each comment says how.
//
// Provenance (all entries unless a line says otherwise):
//   source   the API Lambda `crm-api-trpc` (account profile `assess`, region eu-north-1), invoked
//            with an API Gateway v2 event: `search.properties`, `search.permits`, `property.get`
//   read on  2026-10-25
//   run      travis-full-run2-20261024 (Task A Run 2: 441,961 properties, 15,025 Austin permits)
//   manifest bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute
//
// Honest data facts behind the choices (measured on that index with the map's own default query:
// `search.properties` with NO roof age filter, which is what the Map opens with):
//  - rows exist almost everywhere in Travis County, but their number grows fast with the radius:
//    Central Austin has 4,488 properties within 1 mi and 73,621 within 5 mi, Pflugerville 3,955 /
//    24,864 within 1 / 3 mi. The API answers in about 0.5 s per thousand properties (1 mi about
//    2 s, 3 mi in Pflugerville 5.5 s, 5 mi in Central Austin 14.6 s), and `search.permits` for 5 mi
//    in Central Austin did not answer inside the 28 s Lambda limit. That is a PRODUCT finding (NFR-001
//    is p95 under 3 s); these fixtures therefore use mid-density pins with small radii so the
//    layout and search specs test layout and search, not the Lambda timeout.
//  - only about 2 percent of properties have a roof age (a closed reroof permit), so a roof age
//    filter, when a spec sets one, empties most areas.
//  - open permits are rare: 15 within 2 mi of the Central Austin pin below.
//
// A new Task A run can move any of these. Specs therefore assert RELATIONS (results exist, widening
// never loses results, every row is inside the ring), and where a fixed property is needed, the B-07
// suite re-reads it from the live index and fails with a clear message when it drifted.

export const FIXTURES_MANIFEST_CID = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";
export const FIXTURES_RUN_ID = "travis-full-run2-20261024";

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** Central Austin: the densest hex cell with roofs of 20 years or more (1,363 properties), and
 *  the neighbourhood of the open-permit lead fixture below. Used only as the lead-list area centre
 *  (leads.list is a small DynamoDB read, not a radius search over the index). */
export const CENTRAL_AUSTIN: LatLng = { lat: 30.3539, lng: -97.7382 };

/** East Travis County pin used for pin-drop and radius specs.
 *  `search.properties`, no roof filter: 0.5 mi gives 13 properties, 1 mi 81, 3 mi 1,006
 *  (answered in 1.9 s), 5 mi 10,869 (3.9 s). Rows exist at every radius from 1 mi up. */
export const EAST_TRAVIS: LatLng = { lat: 30.4, lng: -97.45 };

/** The pin the layout suite opens through the URL (`/?lat&lng&r`): EAST_TRAVIS at 3 mi, 1,006
 *  properties, so the result list has rows and loads in about 2 s. */
export const LAYOUT_SEARCH_PATH = `/?lat=${EAST_TRAVIS.lat}&lng=${EAST_TRAVIS.lng}&r=3`;

/** A pocket in north-east Travis County that is honestly empty at 0.5 mi and has results one
 *  +1 mi step wider.
 *  `search.properties`, no roof filter: 0.5 mi gives afterRadius 0; 1.5 mi gives afterRadius 1,225.
 *  It is opened through the URL, not a map click: at county zoom one pixel is about 260 m, so a
 *  click would shift the centre by more than a 0.5 mi ring tolerates. */
export const ZERO_THEN_WIDEN: LatLng & {
  readonly zeroRadiusMi: number;
  readonly widenedMi: number;
} = { lat: 30.5, lng: -97.55, zeroRadiusMi: 0.5, widenedMi: 1.5 };

/** GPS stubs. Georgetown is in Williamson County, outside Travis County whatever the data. */
export const GEORGETOWN: LatLng = { lat: 30.6333, lng: -97.678 };

/** The perf run opens this pin and then changes the radius 6 to 25 mi, as NFR-001's test case
 *  says. */
export const PERF_PIN: LatLng = EAST_TRAVIS;

/** A lead fixture: a real Austin property, found by CID, with the request identifier the index
 *  reports for it (the lead key is `48453:tcad:{requestIdentifier}`). */
export interface LeadFixture {
  readonly cid: string;
  readonly requestIdentifier: string;
  readonly why: string;
}

/** Three real Austin properties for the leads suite (B-07).
 *  `property.get` on 2026-10-25:
 *   - openPermit: roof age 28 years (basis permit), 16 permits, OPEN Roofing permits including
 *     2026-121002 BP (open 37 days). Lets TC-001 (roof age text), TC-002 (create from a permit
 *     row) and TC-003 (permit number and open days in the snapshot) run.
 *   - roofOnly: roof age 35 years (basis permit, high confidence) from one closed 1990 Roofing
 *     permit; no open or stalled permit. Used for the 20-concurrent-creates case.
 *   - third: roof age 29 years from one closed 1995 Roofing permit; no open or stalled permit.
 *     Used for the combined-filters count and the create latency case. */
export const LEAD_FIXTURES = {
  openPermit: {
    cid: "baguqeerakmixkpatzw4wbiqtxcqbewecmgrzcw3j4vcm3skbe7zofycy5daq",
    requestIdentifier: "138273",
    why: "roof 28 yr, open Roofing permits (37 days)",
  },
  roofOnly: {
    cid: "baguqeeraytfvpb6zojnidkmmrsc2d5bqcnyhetazws3cl4bwbrs5zbv7auja",
    requestIdentifier: "194540",
    why: "roof 35 yr, closed permit only",
  },
  third: {
    cid: "baguqeeraafvmopmfu534ymklkrp5ifitunsmhugzjt7j22orgxkyng4uhhxa",
    requestIdentifier: "194535",
    why: "roof 29 yr, closed permit only",
  },
} as const satisfies Record<string, LeadFixture>;

/** A permit number that the openPermit fixture holds as an OPEN Roofing permit (read from
 *  `property.get` on the same date; the property has 16 permits, several open, 37 days). */
export const OPEN_PERMIT_NUMBER = "2026-121002 BP";

/** The lead-list area filter centre (10 mi): the neighbourhood of all three fixtures; the
 *  open-permit one is about 1 mi from it. */
export const LEADS_AREA: LatLng = CENTRAL_AUSTIN;

/** A real published manifest that is NOT the served one (carried over unchanged from the earlier
 *  fixture; the served run is FIXTURES_MANIFEST_CID). The request identifier below is absent from the
 *  served index by construction, which is exactly "not in the current run". */
export const OLD_MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";
export const STALE_REQUEST_ID = "B07STALE";
