---
id: QC-TC-B-01
story: stories/B-01-crm-shell.md
spec: specs/001-crm-shell/spec.md
gate: G6
status: Draft
runtime_url: https://crm.aldarraj.com (localhost refused)
qc_signoff: true  # approved with exceptions, PO 2026-10-23, see docs/decisions/tech-debt.md TD-4
---

# Test Cases: B-01 CRM shell

## 1. Mapping
| Source | Covered by |
| --- | --- |
| AC-1, FR-001 | TC-001, TC-006, TC-010 |
| AC-2, FR-002 | TC-002, TC-007 |
| AC-3, FR-003 | TC-003, TC-004, TC-011 |
| AC-4, FR-004 | TC-005, TC-009 |
| AC-5, FR-005 | TC-008 |
| NFR-001 | TC-NF-01, TC-NF-03 |
| NFR-002 | TC-NF-02 |

## 2. Data and environment
- Login from env vars `TEST_USER` / `TEST_PASSWORD`; never stored here.
- Travis County centre 30.2672 N, -97.7431 W; bounds 30.09 to 30.52 N, -98.17 to -97.33 W. Bounding-box corners used as exact pan targets below: NW (30.52 N, -98.17 W), SE (30.09 N, -97.33 W).
- **C-07 N/A, by decision, not deferral:** no manifest CID applies to this story. Constitution Article XI and the Task B addendum (B1) tie manifest-CID provenance to property, permit and lead data; B-01 reads no Task A property/permit records and writes no leads (spec.md Assumptions: "no property/permit/agent data is read in this story"). There is nothing to cite a CID for.
- **Independence note:** every case below describes only what a tester can see or do in the browser, or a response any HTTP/AWS CLI call returns — never a source file, component name, or internal table name. Anything the implementation happens to be called is irrelevant to whether these cases pass.

## 3. Coverage matrix
| TC | Title | P | Tags | Requirement | Playwright test |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Sign in lands on Travis map | P1 | @smoke @demo | AC-1 | `tests/e2e/B-01.spec.ts › "B-01-TC-001 …"` |
| TC-002 | Pan and zoom within county | P1 | @demo | AC-2 | `tests/e2e/B-01.spec.ts › "B-01-TC-002 …"` |
| TC-003 | 4th failed attempt locks | P1 | @negative | AC-3 | `tests/e2e/B-01.spec.ts › "B-01-TC-003 …"` |
| TC-004 | First failed attempt shows plain error | P2 | @negative | AC-3 | `tests/e2e/B-01.spec.ts › "B-01-TC-004 …"` |
| TC-005 | Five roadmap rows disabled | P1 | @demo | AC-4 | `tests/e2e/B-01.spec.ts › "B-01-TC-005 …"` |
| TC-006 | No self sign-up link | P2 | @negative | AC-1 | `tests/e2e/B-01.spec.ts › "B-01-TC-006 …"` |
| TC-007 | Tile outage shows failure state | P2 | @edge @missing-data | FR-002 | `tests/e2e/B-01.spec.ts › "B-01-TC-007 …"` |
| TC-008 | Disabled row opens Coming Soon | P1 | @demo | AC-5 | `tests/e2e/B-01.spec.ts › "B-01-TC-008 …"` |
| TC-009 | 390 px: rows in More sheet | P2 | @edge | AC-4 | `tests/e2e/B-01.spec.ts › "B-01-TC-009 …"` |
| TC-010 | Session survives reload | P2 | @edge | AC-1 | `tests/e2e/B-01.spec.ts › "B-01-TC-010 …"` |
| TC-011 | Lockout clears after 5-minute cooldown | P2 | @negative | AC-3 | `tests/e2e/B-01.spec.ts › "B-01-TC-011 …"` |
| TC-NF-01 | Health-check call traced within 3 s | P2 | @perf | NFR-001 | `tests/e2e/B-01.spec.ts › "B-01-TC-NF-01 …"` |
| TC-NF-02 | 390/768/1440 px usable | P2 | @responsive | NFR-002 | `tests/e2e/B-01.spec.ts › "B-01-TC-NF-02 …"` |
| TC-NF-03 | Both Lambdas emit structured logs | P2 | @observability | NFR-001 | `tests/e2e/B-01.spec.ts › "B-01-TC-NF-03 …"` |

## 4. Test cases

**TC-001 (happy).** 1. Open `{RUNTIME_URL}/` in a private window. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}` in the password field. 4. Click "Sign in". → A map screen renders; the map is centred within ±0.01° of 30.2672 N, -97.7431 W; no element with the text "Sign up" or "Create account" appears anywhere on the page.

**TC-002 (happy).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}` in the password field. 4. Click "Sign in". → Map screen renders. 5. Note the current browser tab's navigation entry count (`window.history.length`). 6. Zoom the map out until the full county (30.09–30.52 N, -98.17 to -97.33 W) is visible on screen. → The whole bounding box is visible; `window.history.length` is unchanged from step 5 (no reload occurred). 7. Pan the map to centre on 30.52 N, -98.17 W (the NW county corner). → The map re-centres there without a page reload; `window.history.length` is still unchanged. 8. Pan the map to centre on 30.09 N, -97.33 W (the SE county corner). → The map re-centres there without a page reload; `window.history.length` is still unchanged.

**TC-003 (negative).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter the text `{TEST_PASSWORD}x` (the correct password with a trailing "x") in the password field. 4. Click "Sign in". → Text exactly "Incorrect email or password." appears; the "Sign in" button is not disabled. 5. Enter `{TEST_USER}` in the email field. 6. Enter `{TEST_PASSWORD}x` in the password field. 7. Click "Sign in". → Same text as step 4; button not disabled. 8. Enter `{TEST_USER}` in the email field. 9. Enter `{TEST_PASSWORD}x` in the password field. 10. Click "Sign in". → Same text as step 4; button not disabled. 11. Enter `{TEST_USER}` in the email field. 12. Enter `{TEST_PASSWORD}x` in the password field. 13. Click "Sign in". → Text exactly "Too many attempts — try again in 5 minutes" appears; the "Sign in" button is disabled; no HTTP 500 response and no blank page.

**TC-004 (negative).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}x` in the password field. 4. Click "Sign in". → Text exactly "Incorrect email or password." appears; no text containing "attempts" or "locked" appears anywhere on the page; the "Sign in" button is not disabled.

**TC-005 (happy).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}` in the password field. 4. Click "Sign in". → Map screen renders. 5. Hover the "Campaigns" row in the navigation rail. → A tooltip with the text exactly "Coming soon" appears; the row's `aria-disabled` attribute equals `"true"`. 6. Hover the "Estimates" row. → Same tooltip text; `aria-disabled="true"`. 7. Hover the "Jobs" row. → Same tooltip text; `aria-disabled="true"`. 8. Hover the "Invoices" row. → Same tooltip text; `aria-disabled="true"`. 9. Hover the "Outreach" row. → Same tooltip text; `aria-disabled="true"`.

**TC-006 (negative).** 1. Open `{RUNTIME_URL}/`. 2. Read every element of text on the sign-in page. → No element contains the text "Sign up" or "Create account".

**TC-007 (edge, missing-data).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}` in the password field. 4. Click "Sign in". → Map screen renders. 5. Register a Playwright network route that aborts every outgoing request whose target origin differs from `{RUNTIME_URL}`'s own origin while this page is open (this screen's only cross-origin calls are its map-tile image requests, so this abort pattern isolates exactly the tile outage, without needing to know or guess the tile host's domain name in advance). 6. Reload the page (`page.reload()`). 7. Sign in again (repeat steps 2–4). → A full-width panel appears over the map area with the heading text exactly "Map tiles unavailable" and a button with the text exactly "Retry"; no blank grey grid of tiles is shown. 8. Click "Retry" (with the route from step 5 still active). → The same panel and button reappear (the retry attempt also fails while tiles are blocked, proving "Retry" re-attempts the load rather than silently doing nothing).

**TC-008 (happy).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}` in the password field. 4. Click "Sign in". → Map screen renders. 5. Click the disabled "Campaigns" row. → The URL becomes `{RUNTIME_URL}/coming-soon/campaigns`; a heading with the text exactly "Coming soon" appears; no HTTP 404 response and no blank page. 6. Click the button with the text "Back to Map". → Map screen renders again, centred within ±0.01° of 30.2672 N, -97.7431 W.

**TC-009 (edge).** 1. Set the viewport to 390×844 px. 2. Open `{RUNTIME_URL}/`. 3. Enter `{TEST_USER}` in the email field. 4. Enter `{TEST_PASSWORD}` in the password field. 5. Click "Sign in". → Map screen renders. 6. Click the "More" sheet trigger. → A sheet opens listing five rows: Campaigns, Estimates, Jobs, Invoices, Outreach; every one of the five has `aria-disabled="true"`.

**TC-010 (edge).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}` in the password field. 4. Click "Sign in". → Map screen renders. 5. Reload the page (`page.reload()`). → Map screen renders directly; no sign-in form is shown.

**TC-011 (negative).** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}x` in the password field. 4. Click "Sign in". → Text exactly "Incorrect email or password." appears (attempt 1). 5. Enter `{TEST_USER}` in the email field. 6. Enter `{TEST_PASSWORD}x` in the password field. 7. Click "Sign in". → Same text (attempt 2). 8. Enter `{TEST_USER}` in the email field. 9. Enter `{TEST_PASSWORD}x` in the password field. 10. Click "Sign in". → Same text (attempt 3). 11. Enter `{TEST_USER}` in the email field. 12. Enter `{TEST_PASSWORD}x` in the password field. 13. Click "Sign in". → Text exactly "Too many attempts — try again in 5 minutes" (attempt 4, locked). 14. Call the test harness's lockout-reset fixture for `{TEST_USER}` (a test-only backdoor documented in the Playwright test helpers, not a specific table or file — its only contract is "this account's cooldown ends immediately"; it exists purely to avoid a real 5-minute wait in CI). 15. Enter `{TEST_USER}` in the email field. 16. Enter `{TEST_PASSWORD}` (the correct password) in the password field. 17. Click "Sign in". → Map screen renders; no element on the page contains the text "attempts" or "locked".

**TC-NF-01.** 1. Open `{RUNTIME_URL}/`. 2. Record the current time (`performance.now()` plus wall-clock time). 3. Enter `{TEST_USER}` in the email field. 4. Enter `{TEST_PASSWORD}` in the password field. 5. Click "Sign in". → Map screen renders. 6. Query AWS X-Ray (region `eu-north-1`, `GetTraceSummaries`) for traces with a start time between the step-2 timestamp and 3 seconds after it. → At least one trace matching the health-check call made during this page load is returned, with a start timestamp within 3 seconds of the step-2 timestamp.

**TC-NF-02.** 1. Set the viewport to 390×844 px. 2. Open `{RUNTIME_URL}/`. → Sign-in screen renders. 3. Read `document.documentElement.scrollWidth` and `document.documentElement.clientWidth`. → `scrollWidth` is less than or equal to `clientWidth` (no horizontal scrollbar). 4. Confirm the "Sign in" button is within the viewport. → Visible, no horizontal scroll needed to reach it. 5. Enter `{TEST_USER}` in the email field. 6. Enter `{TEST_PASSWORD}` in the password field. 7. Click "Sign in". → Map screen renders. 8. Read `scrollWidth`/`clientWidth` on the map screen. → `scrollWidth` ≤ `clientWidth`. 9. Confirm the "More" sheet trigger is within the viewport. → Visible. 10. Click the "More" sheet trigger, then click the disabled "Campaigns" row. → Coming Soon screen renders. 11. Read `scrollWidth`/`clientWidth` on the Coming Soon screen. → `scrollWidth` ≤ `clientWidth`. 12. Confirm the "Back to Map" button is within the viewport. → Visible. 13. Set the viewport to 768×1024 px. 14. Open `{RUNTIME_URL}/`. → Sign-in screen renders. 15. Read `scrollWidth`/`clientWidth`. → `scrollWidth` ≤ `clientWidth`. 16. Confirm the "Sign in" button is within the viewport. → Visible. 17. Enter `{TEST_USER}` in the email field. 18. Enter `{TEST_PASSWORD}` in the password field. 19. Click "Sign in". → Map screen renders. 20. Read `scrollWidth`/`clientWidth` on the map screen. → `scrollWidth` ≤ `clientWidth`. 21. Confirm the navigation rail is within the viewport. → Visible. 22. Click the disabled "Campaigns" row. → Coming Soon screen renders. 23. Read `scrollWidth`/`clientWidth` on the Coming Soon screen. → `scrollWidth` ≤ `clientWidth`. 24. Confirm the "Back to Map" button is within the viewport. → Visible. 25. Set the viewport to 1440×900 px. 26. Open `{RUNTIME_URL}/`. → Sign-in screen renders. 27. Read `scrollWidth`/`clientWidth`. → `scrollWidth` ≤ `clientWidth`. 28. Confirm the "Sign in" button is within the viewport. → Visible. 29. Enter `{TEST_USER}` in the email field. 30. Enter `{TEST_PASSWORD}` in the password field. 31. Click "Sign in". → Map screen renders. 32. Read `scrollWidth`/`clientWidth` on the map screen. → `scrollWidth` ≤ `clientWidth`. 33. Confirm the navigation rail is within the viewport. → Visible. 34. Click the disabled "Campaigns" row. → Coming Soon screen renders. 35. Read `scrollWidth`/`clientWidth` on the Coming Soon screen. → `scrollWidth` ≤ `clientWidth`. 36. Confirm the "Back to Map" button is within the viewport. → Visible.

*(This case is the narrow, Playwright-automatable functional-reachability check. The `smeargle` suite named by NFR-002 is the broader layout authority and runs separately — Phase Z / TZ04 in `specs/001-crm-shell/tasks.md`.)*

**TC-NF-03.** 1. Open `{RUNTIME_URL}/`. 2. Enter `{TEST_USER}` in the email field. 3. Enter `{TEST_PASSWORD}` in the password field. 4. Click "Sign in". → Map screen renders (this triggers the health-check call). 5. Repeat TC-003's steps 1–13 against a second test iteration of the sign-in form on the same page, using a different browser context, to force a lockout event (this triggers the pre-authentication check). 6. Query AWS CloudWatch Logs (region `eu-north-1`, `FilterLogEvents`) across every log group whose name starts with `/aws/lambda/` and contains `roofing-crm` or `crm-`, for entries in the last 5 minutes. → At least two distinct log groups return at least one entry each (one from the health-check call, one from the sign-in/lockout check); every returned entry is valid JSON containing a `level` field and a `service` field (the shape Powertools' Logger emits), confirming NFR-001's "every Lambda wrapped with Powertools" clause at the two Lambdas this story actually has, not by code inspection alone.

## 5. Self-check (inline G6 pre-check; no report written)

Status after 4 fix-and-retry rounds against `developmentsupport-g6-precheck` (full history in `specs/001-crm-shell/run-log.md`). The PO accepted the remaining items as test-plan polish debt (`docs/decisions/tech-debt.md` TD-4) rather than a 5th fix cycle — none of them represent an AC or NFR left untested.

- **C-01 AC coverage**: PASS.
- **C-02 FR coverage**: PASS.
- **C-03 Path coverage**: PASS.
- **C-04 NFR tests**: PASS with an accepted gap (TD-4) — TC-NF-03 verifies Powertools' Logger JSON shape on both Lambdas; it does not separately assert a Tracer segment or an EMF metric.
- **C-05 Complete steps**: PASS with an accepted gap (TD-4) — TC-007 and TC-NF-03 still use "repeat steps N–M" shorthand; every other case is fully unrolled.
- **C-06 Exact expectations**: PASS. TC-007 describes only visible text ("Map tiles unavailable", "Retry") and an observable network-abort rule; TC-011 asserts the literal absence of specific text.
- **C-07 Real test data**: PASS, decision recorded (§2).
- **C-08 Independence**: PASS with an accepted gap (TD-4) — TC-NF-02 names its sibling phase ("Phase Z / TZ04") rather than describing `smeargle`'s role in implementation-independent language.
- **C-09 Automation mapping**: PASS with an accepted gap (TD-4) — the coverage matrix's Playwright titles are truncated with "…" rather than spelling out each exact `test()` string.

**Verdict: accepted with 4 logged polish exceptions (TD-4), PO sign-off 2026-10-23. No AC or NFR is untested.**
