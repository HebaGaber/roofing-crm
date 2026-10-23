---
id: QC-TC-B-02
type: test-cases
title: Build the lead search index from Task A's published data
parent: FEAT-B02
story: stories/B-02-lead-index.md
spec: specs/002-lead-index/spec.md
owner: HebaGaber
status: Draft
gate: G6
version: 0.1
created: 2026-10-23
runtime_url: https://crm.aldarraj.com (or the current 002-lead-index Amplify branch preview)
reviewed_code: "(filled after build)"
qc_signoff: false
---

# Test Cases: B-02 Build the lead search index from Task A's published data

> Drafted from `stories/B-02-lead-index.md`'s Given/When/Then ACs and `specs/002-lead-index/spec.md`'s FRs, independent of `tasks.md`. This story has `ui: false`, so every case proves itself on the **deployed Step Functions execution in `eu-north-1`** (the hosted runtime for a story with no UI), never localhost — per constitution Article I and XXII. Three cases are adapted from Task A's `testplans/A-03-test-cases.md` (tagged `from A TC-nnn`), changing only the data and the target system, per `WALKTHROUGH-B-sample-first.md` §3.

## 1. Feature overview

The sync job fetches Task A's published property and roofing-permit tables by CID, verifies every byte, and writes the CRM's own `crm_property`/`crm_permit` Parquet index, carrying provenance on every row and flipping the `META#index` pointer only after validation passes. This story has no UI; its value is proven by the index's correctness, completeness, and safety to re-run.

## 2. Requirement mapping

| Source | Reference | Covered by |
| --- | --- | --- |
| Acceptance criterion | B-02-AC-1 | TC-001, TC-002, TC-003 |
| Acceptance criterion | B-02-AC-2 (scale) | TC-004, TC-005 |
| Acceptance criterion | B-02-AC-3 (missing-data) | TC-006, TC-007 |
| Acceptance criterion | B-02-AC-4 | TC-008, TC-009 |
| Functional requirement | FR-001 | TC-001, TC-002, TC-003 |
| Functional requirement | FR-002 | TC-004, TC-005 |
| Functional requirement | FR-003 | TC-006, TC-007 |
| Functional requirement | FR-004 | TC-008, TC-009 |
| NFR | NFR-001 (sync duration) | TC-NF-01 |
| NFR | NFR-002 (gateway politeness) | TC-NF-02, TC-010 |
| Edge case | one part fails verification → quarantine, no partial promotion | TC-011 |
| Edge case | row count drops > 5% → held for review | TC-012 |

## 3. Assumptions

- The sample manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` (35 roofing rows, Austin permits, September 2026) is used for every case except TC-004/TC-005's full-county scale assertion, which is exercised in shape only until the "S · Data switch" step (per the story's note under AC-2).
- "Open the hosted runtime" for this UI-less story means: read the deployed Step Functions execution's status/output (via the AWS CLI or console under profile `assess`, region `eu-north-1`) and query the deployed API Lambda's `indexInfo()`/`searchProperties()` — never a local DuckDB file, never `localhost`.
- `donphan`'s MCP cross-check is read-only and never on the request path.

## 4. Scope

- **In scope:** CID fetch and verification, gateway fallback order, count reconciliation, missing-data preservation, idempotent re-run, the cost/lineage hold conditions, gateway politeness.
- **Out of scope:** any UI rendering of this data (B-03, B-07, B-09); the agent (B-09); full-county reconciliation at real scale (deferred to the "S · Data switch" step, flagged as a known gap until then).

## 5. Test data

- Manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` (run `travis-202609-permits-20261021t103516z`), 35 roofing rows, Austin permits for September 2026.
- A fixture property row with `roof_age_basis` recorded as the contract's `missing` value (a parcel near Del Valle with no permit history, per the story's own example) — drawn from the sample manifest's real published rows, not invented.
- Data snapshot for every case below: this same manifest CID, recorded in `docs/evidence/B-02.md` once run.

## 6. Environment, risks and dependencies

- AWS profile `assess`, region `eu-north-1`. `DATA_MANIFEST_CID` read from deployed config, never hard-coded in a test.
- Known gap: AC-2's full-county count check is exercised in shape only against the sample (35 rows); the real reconciliation happens at the later "S · Data switch" step — TC-004/TC-005 are written to pass in shape now and are expected to be re-run at full scale later, not re-written.
- Dependency: B-01's CrmData/CrmSync stacks (currently empty stubs) must be filled before any case here can run against a deployed execution.
- **Automation exception (G6 C-09):** this story has `ui: false` — there is no page for Playwright to drive. Every P1/P2 case is instead automated as a Vitest test against the deployed Step Functions execution and API Lambda (named per case below), or, where no automated check applies (count cross-check, concurrent-execution race), as a documented manual AWS CLI step recorded in `docs/evidence/B-02.md`. This substitution is recorded here, once, rather than repeated per case, per the QC Lead's (user's) ratification at G6 approval.

## 7. Coverage matrix

| TC ID | Title | Priority | Tags | Type | Requirement(s) | Automation |
| --- | --- | --- | --- | --- | --- | --- |
| B-02-TC-001 | Sync fetches `v_property`/`v_roofing_permit` by CID, verified by sha256 (from A TC-003) | P1 | @smoke @pipeline | AWS | AC-1, FR-001 | `tests/e2e/manifest.spec.ts › "B-02-TC-001"` |
| B-02-TC-002 | Every indexed row carries `sourceManifestCid` | P1 | @smoke | AWS | AC-1, FR-001 | `apps/api/test/query.test.ts › "B-02-TC-002"` |
| B-02-TC-003 | CID copy down → Filebase → Pinata fallback, in order (from A TC-032/033/034) | P1 | @negative @error | AWS | AC-1, FR-001, NFR-002 | `tests/e2e/fallback.spec.ts › "B-02-TC-003"` |
| B-02-TC-004 | `crm_property` count equals manifest `coverage.parcels_published` (shape, sample scale) | P1 | @pipeline | AWS | AC-2, FR-002 | `tests/e2e/verify-manifest.spec.ts › "B-02-TC-004"` |
| B-02-TC-005 | `donphan` independently confirms the count through the Oracle MCP | P1 | @cross-check | MCP | AC-2, FR-002 | manual + `docs/evidence/B-02.md` |
| B-02-TC-006 | Missing roof-age reason preserved verbatim, never guessed | P1 | @missing-data | AWS | AC-3, FR-003 | `apps/api/test/query.test.ts › "B-02-TC-006"` |
| B-02-TC-007 | No row in the index has an invented/interpolated value where a `missing` reason was published | P1 | @missing-data | AWS | AC-3, FR-003 | `apps/sync/test/missingReasons.test.ts › "B-02-TC-007"` |
| B-02-TC-008 | Re-sync of an already-indexed manifest CID creates zero new S3 objects | P1 | @smoke @idempotency | AWS | AC-4, FR-004 | `apps/sync/test/idempotency.test.ts › "B-02-TC-008"` |
| B-02-TC-009 | A second concurrent execution for the same manifest CID is rejected, not run in parallel | P2 | @idempotency | AWS | AC-4, FR-004 | manual (`start-execution` twice) |
| B-02-TC-010 | Gateway politeness: concurrency 2, ≤30 req/min per gateway, backoff+jitter on 429/5xx | P2 | @perf @negative | AWS | NFR-002 | `packages/config/test/gatewayPolicy.test.ts › "B-02-TC-010"` |
| B-02-TC-011 | A part's bytes fail sha256 → quarantined, alarm fires, previous index still serves | P1 | @negative @edge | AWS | Edge case 1 | `apps/sync/test/fetchPart.test.ts › "B-02-TC-011"` |
| B-02-TC-012 | Row count drop > 5% from the previous run → held for review, never silently promoted | P1 | @negative @edge | AWS | Edge case 2 | `apps/sync/test/validate.test.ts › "B-02-TC-012"` |
| B-02-TC-NF-01 | Sync duration ≤ 5 min for the sample-manifest-sized run | P2 | @perf | AWS | NFR-001 | manual + `docs/evidence/B-02.md` (`SyncDurationMs`) |
| B-02-TC-NF-02 | Index cold load ≤ 3 s per sandbox per manifest | P2 | @perf | AWS | ARD-B §10 | manual (`IndexColdLoadMs` metric) |

## 8. Functional test cases

### B-02-TC-001: Sync fetches `v_property`/`v_roofing_permit` by CID, verified by sha256 (happy path) (from A TC-003)

- **Priority / tags:** P1 · `@smoke @pipeline`
- **Maps to:** AC-1, FR-001
- **Preconditions:** `CrmData`/`CrmSync` deployed to `eu-north-1`; `DATA_MANIFEST_CID = bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`.
- **Test data:** the sample manifest CID above.
- **Steps:**
  1. **Trigger** the deployed `crm-sync` state machine with execution name = the manifest CID.
  2. **Wait** for the execution to reach `SUCCEEDED` (`aws stepfunctions describe-execution`).
  3. **Fetch** the manifest at that CID and read its `artifacts[]` entries for `v_property` and `v_roofing_permit`.
  4. **Verify** each fetched part's sha256 (recorded in the `FetchPart` step's CloudWatch log) matches the manifest's stated digest for that artifact.
- **Expected result:** execution status `SUCCEEDED`; both parts' sha256 match the manifest exactly; no part shows a mismatch.

### B-02-TC-002: Every indexed row carries `sourceManifestCid` (happy path)

- **Priority / tags:** P1 · `@smoke`
- **Maps to:** AC-1, FR-001
- **Preconditions:** TC-001 has completed successfully.
- **Steps:**
  1. **Query** the deployed API Lambda's `indexInfo()` for the current promoted `manifestCid`.
  2. **Query** `searchProperties({})` (no filter) and `searchPermits({})`, 35 total rows expected across both.
  3. **Verify** every returned row's `sourceManifestCid` field equals `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` exactly.
- **Expected result:** 100% of rows carry the correct `sourceManifestCid`; zero rows with a missing or mismatched value.

### B-02-TC-003: CID copy down → Filebase → Pinata fallback, in order (negative) (from A TC-032/033/034)

- **Priority / tags:** P1 · `@negative @error`
- **Maps to:** AC-1, FR-001, NFR-002
- **Steps:**
  1. **Simulate** the CloudFront CID copy returning a connection abort for one `FetchPart` invocation (test fixture / fault injection, not the real production gateway).
  2. **Verify** the fetch falls back to Filebase, labeled `fallback` in the execution's structured log.
  3. **Simulate** Filebase also returning 500.
  4. **Verify** the fetch falls back to Pinata next, in that exact order — never ipfs.io or dweb.link at any point.
  5. **Verify** the final returned bytes still pass sha256 verification against the manifest, regardless of which gateway served them.
- **Expected result:** gateway order is exactly CloudFront → Filebase → Pinata; the log records `fallback` at each hop; the part's sha256 is verified no matter which gateway it came from.

### B-02-TC-004: `crm_property` count equals manifest `coverage.parcels_published` (shape check at sample scale)

- **Priority / tags:** P1 · `@pipeline`
- **Maps to:** AC-2, FR-002
- **Preconditions:** TC-001 has completed; the sample manifest's `coverage.parcels_published` value is known.
- **Steps:**
  1. **Query** the deployed index's property-record count via `indexInfo()`.
  2. **Compare** it to the sample manifest's `coverage.parcels_published` value.
  3. **If they differ**, verify `docs/evidence/B-02.md` records every difference with a reason, per FR-002.
- **Expected result:** counts match exactly, or every difference is documented with a stated reason — never an unexplained gap. *(Known gap: this proves the mechanism in shape against 35 sample rows; real full-county reconciliation is a separate step, not re-tested here until then.)*

### B-02-TC-005: `donphan` independently confirms the count through the Oracle MCP

- **Priority / tags:** P1 · `@cross-check`
- **Maps to:** AC-2, FR-002
- **Steps:**
  1. **Ask** `soofi-xyz-team-kit:donphan` (via the Oracle MCP, read-only, never on the request path) for the sample manifest's published property count.
  2. **Compare** the integer `donphan` returns to the integer read via TC-004's `indexInfo().propertyCount`.
- **Expected result:** the two integers are numerically equal (both expected to be the sample manifest's published property count — 35 rows' worth of distinct properties, or the manifest's stated `coverage.parcels_published` value if that differs from the raw row count). A numeric mismatch is a FAIL, recorded in `docs/evidence/B-02.md` with which source was stale (per the story's "if something goes wrong" guidance — never averaged or silently accepted).

### B-02-TC-006: Missing roof-age reason preserved verbatim, never guessed (missing data)

- **Priority / tags:** P1 · `@missing-data`
- **Maps to:** AC-3, FR-003
- **Target:** the deployed API Lambda's `LeadIndex` port, against the sample-manifest index (`eu-north-1`).
- **Test data:** the first row returned by `searchProperties({ roofAgeBasis: "missing" })` against the sample manifest — a real published row (the story's own example names "a parcel near Del Valle with no permit history" as this row's likely identity; the exact `propertyCid` is read at run time from this query, not pre-guessed, since the manifest's row order is not fixed test fixture data).
- **Steps:**
  1. **Query** `searchProperties({ roofAgeBasis: "missing" })` against the deployed index; **take** the first result's `propertyCid`.
  2. **Query** `getProperty(propertyCid)` for that exact property.
  3. **Verify** `roofAgeYears` is `null` and `roofAgeBasis` carries the contract's exact `missing` enum value — not a 0, not an average, not an omitted field.
- **Expected result:** the exact published missing reason is present on the queried property; `roofAgeYears` is never a guessed or interpolated number.

### B-02-TC-007: No row in the index has an invented value where a `missing` reason was published (negative)

- **Priority / tags:** P1 · `@missing-data`
- **Maps to:** AC-3, FR-003
- **Steps:**
  1. **Query** every property row in the sample-manifest index.
  2. **For each row** where a source field was published as `missing`, **verify** the corresponding index field is `null`/absent with the reason intact, never a non-null computed value.
- **Expected result:** zero rows found with a value where the source published `missing` instead.

### B-02-TC-008: Re-sync of an already-indexed manifest CID creates zero new S3 objects (happy path / idempotency)

- **Priority / tags:** P1 · `@smoke @idempotency`
- **Maps to:** AC-4, FR-004
- **Preconditions:** TC-001 has completed; the manifest's parts are already in S3.
- **Steps:**
  1. **List** S3 objects under `crm-index/raw/{manifestCid}/` and `crm-index/index/{manifestCid}/`; record the count N.
  2. **Trigger** the sync again against the same `manifestCid`.
  3. **List** the same S3 prefixes again; record the count.
- **Expected result:** the second count equals N exactly — zero new objects created.

### B-02-TC-009: A second concurrent execution for the same manifest CID is rejected (edge)

- **Priority / tags:** P2 · `@idempotency`
- **Maps to:** AC-4, FR-004
- **Steps:**
  1. **Start** a `crm-sync` execution with name = the manifest CID.
  2. **Immediately start** a second execution with the identical name, before the first completes.
- **Expected result:** the second `start-execution` call fails with an execution-already-exists error; only one execution runs to completion for that CID.

### B-02-TC-010: Gateway politeness — ≤30 req/min, backoff+jitter on 429/5xx (NFR)

- **Priority / tags:** P2 · `@perf @negative`
- **Maps to:** NFR-002
- **Steps:**
  1. **Simulate** a gateway returning 429 for a `FetchPart` request (fault injection, not production traffic).
  2. **Verify** the retry uses exponential backoff with jitter, and that no gateway receives more than 30 requests in any 60-second window during the run.
  3. **Verify** after 5 exhausted retries on one gateway, the fetch switches to the next gateway in order rather than retrying indefinitely.
- **Expected result:** rate stays at or under 30 req/min per gateway; backoff is exponential with jitter, not fixed; gateway switch happens at exactly 5 retries.

### B-02-TC-011: A part's bytes fail sha256 → quarantined, alarm fires, previous index still serves (edge, negative)

- **Priority / tags:** P1 · `@negative @edge`
- **Maps to:** Edge case 1 (stories/B-02-lead-index.md)
- **Preconditions:** a previously promoted run exists with `manifestCid = M_prev` and `indexInfo().manifestCid = M_prev`.
- **Steps:**
  1. **Trigger** a new sync run against a test manifest `M_test`, with one part's fetched bytes corrupted (fault injection: a Playwright/test-harness route override or a fixture `FetchPart` invocation, not production traffic).
  2. **Verify** the `crm-sync` state machine's `CloudWatch Logs` record that part as failed verification, and that the run's `index_meta.status` is `Held` (never `Validated`/`Promoted`) for `M_test`.
  3. **Verify** the CloudWatch alarm named in `infra/lib/crm-sync-stack.ts` for the sync DLQ/held-run condition transitions to `ALARM` state.
  4. **Query** `indexInfo()` immediately after.
- **Expected result:** `indexInfo().manifestCid` still equals `M_prev`, exactly as before the test run — the corrupted run (`M_test`) never promotes, even partially; the named CloudWatch alarm is in `ALARM` state until the held run is resolved.

### B-02-TC-012: Row count drop > 5% from the previous run → held for review (edge, negative)

- **Priority / tags:** P1 · `@negative @edge`
- **Maps to:** Edge case 2 (stories/B-02-lead-index.md)
- **Steps:**
  1. **Simulate** `Validate` receiving a `BuildIndex` output whose property count is more than 5% below the currently promoted run's count (fixture, not a real Task A republish).
  2. **Verify** `index_meta.status` is set to `Held` with `heldReason: "drop_over_5_percent"`.
  3. **Query** `indexInfo()`.
- **Expected result:** the pointer is never flipped for this run; `indexInfo()` still serves the prior count; the hold is visible for operator review (not silently promoted, not silently discarded).

### B-02-TC-NF-01: Sync duration ≤ 5 min for the sample-manifest-sized run (NFR)

- **Priority / tags:** P2 · `@perf`
- **Maps to:** NFR-001
- **Preconditions:** TC-001 has not yet run against a fresh manifest (so the measured duration is a real end-to-end run, not a cache hit).
- **Steps:**
  1. **Record** the `crm-sync` execution's `startDate` (from `describe-execution`).
  2. **Trigger** the sync against the sample manifest CID.
  3. **Record** the execution's `stopDate` once it reaches `SUCCEEDED`.
  4. **Read** the `SyncDurationMs` metric emitted by the `Promote` step for this execution (CloudWatch Metrics, namespace `RoofingCrm`).
- **Expected result:** `stopDate - startDate` and the emitted `SyncDurationMs` both show ≤ 5 minutes (300,000 ms) for this 35-row sample run.

### B-02-TC-NF-02: Index cold load ≤ 3 s per sandbox per manifest (NFR)

- **Priority / tags:** P2 · `@perf`
- **Maps to:** architecture-constitution.md §10 ("Index cold load" row)
- **Preconditions:** a fresh Lambda sandbox (post-deploy or after a forced cold start) with nothing yet in `/tmp` for the current manifest.
- **Steps:**
  1. **Invoke** the API Lambda's `searchProperties({})` for the first time after a deploy (cold sandbox).
  2. **Read** the `IndexColdLoadMs` metric emitted around that first download-and-open path (CloudWatch Metrics, namespace `RoofingCrm`).
  3. **Invoke** the same query again on the same (now warm) sandbox.
  4. **Verify** the second invocation emits no `IndexColdLoadMs` value (cache hit, not a cold load).
- **Expected result:** the first invocation's `IndexColdLoadMs` is ≤ 3,000 ms; the second invocation records no cold-load metric at all.

## 9. Edge cases

- Full-county scale (AC-2 at real scale) → deferred to the "S · Data switch" step; TC-004/TC-005 are re-run then, not re-written.
- The published manifest carries no explicit contract-version field (ARD-B §6 open item) → not separately tested here; the digest guard (vendored-package drift) is tested via `apps/sync/test/plan.digestGuard.test.ts` at the unit level, referenced but not duplicated as a QC case since it has no observable hosted-runtime behavior beyond "the sync holds," already covered by TC-011/TC-012's pattern.

## 10. Gap-linked cases (expected to fail until fixed)

| TC ID | Asserts | Gap | Defect |
| --- | --- | --- | --- |
| B-02-TC-004 | Full-county count reconciliation | Full-county manifest not yet published (A-11 pending) | Tracked in `docs/plan.md` EXT-01, not a defect — expected until the data switch |

## 11. Execution log (filled in Phase 5)

| TC ID | Run date | Build (sha) | Result | Evidence | Defect |
| --- | --- | --- | --- | --- | --- |
| B-02-TC-001 | — | — | — | — | — |

---

## Gate G6: Test Case Approval

| # | Criterion | Status |
| --- | --- | --- |
| G6-1 | Every AC and every FR maps to at least one TC (§ 2 and § 7) | ☑ |
| G6-2 | Happy, negative, edge and missing-data paths covered | ☑ |
| G6-3 | NFRs have test cases with measurable pass criteria | ☑ |
| G6-4 | Every case is a complete sequence starting from the hosted URL | ☑ (adapted for a UI-less story: "the hosted URL" = the deployed Step Functions execution / API Lambda, per § Assumptions) |
| G6-5 | Negative cases state the exact message or rejection behavior | ☑ |
| G6-6 | Test data and environment documented, with real records | ☑ |
| G6-7 | Every TC traces to the story and a requirement | ☑ |
| G6-8 | AI pre-check (`developmentsupport-g6-precheck`): PASS | ☐ (pending) |

**Decision:** ☐ Approved ☐ Returned, reason: {…} · {date}
