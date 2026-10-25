# Pending items after B-09

Created 2026-10-25 at the PO's request. B-09 closes and merges on Task A's **Run 2**. Everything below is deliberately **not** in B-09; it belongs on the follow-up branch the PO creates from `feature/roofing-crm` after the merge (suggested name `010-run3-and-release`).

Rules that carry over: never merge the PR into `prismteam-ai/roofing-crm`; no `#` followed by a number in commits, PR text or comments (the fork links it to other candidates' PRs; write `F-8` or "finding 8"); commit messages start with the story ID; no secrets in git or logs; AWS profile `assess`, region `eu-north-1`.

## 0. State at B-09 close

| Item | Value |
| --- | --- |
| Data the app serves | Task A Run 2, run `travis-full-run2-20261024`, manifest `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute` |
| Index size | 441,961 properties, 15,025 roofing permits (equal to Task A's `permits_emitted`), 130 of 225 table parts fetched (about 322 MB) |
| Where Run 2 specifics live | `tests/e2e/lib/run-fixtures.ts` (with `fixtures-valid.spec.ts` and `refresh-fixtures.md`), `tests/agent/golden.json` (`manifestCid`), `testplans/B-09-test-cases.md` section 5, `docs/evidence/B-09.md`, the pinned CID in tests and specs |
| How a new run is picked up | Change `DATA_MANIFEST_CID`; a deploy writes it to the SSM parameter `/crm/sync/data-manifest-cid` and starts one sync (execution name `{cid}-{deployNonce}`); an already promoted CID is a no-op |
| Deploy method | Clean checkout of the commit, `aws configure export-credentials --profile assess --format env`, then `cdk deploy --all --require-approval never` from `infra/` with `AWS_REGION`, `CDK_DEFAULT_REGION`, `CDK_DEFAULT_ACCOUNT=515618610572`, `DATA_MANIFEST_CID`, `AI_PROVIDER=bedrock`, `AGENT_MODEL_ID=eu.anthropic.claude-sonnet-4-6`. Docker must be running (the three DuckDB Lambdas bundle in a container). |
| CI | Green path: `workspace` (about 2 min, arm64 runner) and `e2e-hosted` (two phases; waits for `/build.json` to name its own commit). CI uses the scoped `crm-ci` IAM user via two repository secrets. |

## 1. Run 3 handling (the main follow-up)

### 1.1 Verify the manifest before touching anything
1. Download it from the CloudFront CID copy (`https://d2xsqoqv09bd0q.cloudfront.net/{cid}`) and from Filebase (`https://ipfs.filebase.io/ipfs/{cid}`); the bytes must be identical.
2. Recompute the CID from the bytes (CIDv1, raw codec, sha2-256) and compare with the CID you were given.
3. Read `runId`, `previousManifestCid` (must be Run 2's CID), `coverage.permits_emitted`, `limitations`, `profiles[].sha256` (must still equal the vendored profile digest), the number of `kind: "table"` artifacts and their total size.
4. HEAD-check every table part on the CID copy (all must answer 200).

### 1.2 Decide which case it is
| Run 3 manifest | Meaning | Work |
| --- | --- | --- |
| Lists **every** table part, like Run 2 did | Full listing; the existing sync works unchanged | Section 1.3 only |
| Lists **only changed groups** (the Task A spec in `specs/011-publish-and-runs/research.md` says unchanged groups are omitted and a consumer follows `previousManifestCid`) | Delta-only; the sync would hold the run (`unbound_batch`, `zero_properties` or the 5% drop rule) and the app would stay on Run 2 | Section 1.4 first, then 1.3 |

### 1.3 Switch to the new run
1. Set `DATA_MANIFEST_CID` in: the deploy shell, the GitHub repository variable `DATA_MANIFEST_CID`, `tests/agent/golden.json`, the fixtures module, test constants (`grep -rn "bafkreife3vk3" .` lists them), docs.
2. Deploy from a clean checkout (see section 0). The starter fires one sync automatically.
3. Watch the Step Functions execution (`crm-sync`). It succeeds in about 85 seconds for 322 MB. Then read `META#index` in `crm-leads`: `current` must be the new CID, `previous` the old one, and the counts must match the manifest (permits equal `permits_emitted`).
4. If a run is held, the reason is in the Validate output: `unverified_part`, `digest_mismatch`, `drop_over_5_percent`, `permit_reconcile_mismatch`, `zero_properties`, `unbound_batch`, `empty_county_batch`, `cost_gate_exceeded`. The app stays on the previous run. Never override a hold for a run Task A refused to publish.
5. Rollback: redeploy the previous CID (a new sync no-ops if it is already promoted, so flip `META#index.current` back to `previous`), or follow the rollback note in `docs/architecture-constitution.md` section 11.
6. Refresh the fixtures: run `tests/e2e/fixtures-valid.spec.ts`; it tells you which fixture is stale; regenerate with `tests/e2e/lib/refresh-fixtures.md` (about 10 minutes). Re-run the hosted suites, the golden queries (about $1 of Bedrock) and the real-data performance test (`CRM_PERF=1`, `CRM_REAL_INDEX_DIR` pointing at a copy of the new index).
7. Update the evidence: `docs/evidence/B-09.md` gets a "Run 3" section; the test plan's real-data section gets the new values with provenance; keep Run 2's section as history.

### 1.4 Incremental chain-following (only if Run 3 is delta-only)
- Walk back from the newest manifest through `previousManifestCid`, verifying each manifest against its CID, until every data group has its newest artifacts; apply Task A's removal tombstones (`source_removed`).
- Fetch and store parts by their own CID (not "manifest CID + path"), so an incremental sync downloads only changed parts (a permits-only run is a few MB).
- Keep every existing safeguard (CID check, per-part sha256, unverified-part hold, batch coverage, permit reconcile). The index and every lead keep recording the newest manifest CID.
- Where: `apps/sync/handlers/plan.ts` (part list and `boundPartNames`), `buildIndex.ts`, `validate.ts`, `src/batchCoverage.ts`, `packages/oracle-views` (re-vendor from Task A's `query-core` if it changed), infra tests. Tests first, including a crafted three-run chain. Estimate: about half a day.

### 1.5 If Run 3 fills `structure.roof_date` (the main Task A gap)
Expect roof-age coverage to rise from about 2% to about 88% of properties. Consequences: the county hexagons fill in; roof-age questions near Pflugerville, Manor and Lakeway start returning rows; golden queries G1 to G3 are then answered rather than honest empties (the pass rules accept both); hard-coded Run 2 counts in docs and tests change; re-measure the radius and overview queries (more matches per query, the database counts and returns bounded pages); the first-load of the index may grow (more non-null columns).

## 2. Release steps (PLAYBOOK-B Part 4; moved out of B-09 by the PO on 2026-10-25)

Preconditions: B-09 merged into `feature/roofing-crm` with `--no-ff`, pushed, `bash scripts/progress.sh` run, Amplify built `feature/roofing-crm` (that branch is the one `https://crm.aldarraj.com` serves).

| Step | What | Who | Notes |
| --- | --- | --- | --- |
| R1 | Golden Path conformance sweep (`../assessment-guide/reference/checks.md` section 5): list failing rows on the feature branch, fix them, then run `/simplify` once on the final diff | Claude | `/simplify` already ran on the B-09 diff; run again on what changed since |
| R2 | Every kit agent in the arceus routing of `docs/01-intent.md` (at least metagross, espeon, alakazam, ash, machamp, porygon, audino, smeargle) reviews the whole repo read-only; scores, strengths and deviations go to `docs/kit-usage.md`; anything below 75 is fixed and that agent re-run | Claude (8 agents in parallel) | Do not change code during the review pass |
| R3 | `/code-review ultra` | **PO types it** | Billed, cannot be launched by Claude; once |
| R4 | `docs/release.md` from `../assessment-guide/templates/release.md`; `/developmentsupport-g8-precheck`; log in at `https://crm.aldarraj.com` in a private window with the test user and reload; `git tag rel-B1 && git push origin rel-B1` | Claude, PO for the private-window login | Test user `admin@roofing-crm.test`, password in Secrets Manager `roofing-crm/admin-user`; never paste it into a file |
| R5 | Update the existing PR (fork `feature/roofing-crm` into `prismteam-ai/roofing-crm:main`): body from `docs/pr-body.md`, PUBLISHING.md Part 4; then the `babysit-release` skill for PR readiness only (CI green, comments triaged) | Claude | **Never merge the PR.** Do not mark it ready until the PO says so |
| R6 | Self-score with the evaluator in a **new** session: use the `soofi-xyz-team-kit:slowking` subagent with the assignment URL, the PR URL, the runtime URL, the demo link or "pending", and the assignment-sent time from `docs/00-timeline.md`; give it the test user when it asks; fix the lowest-weighted gap first, then re-run | **PO opens the session** | Compare with the 100% checklist in PLAYBOOK-B Part 4 |
| R7 | Record the demo video (PUBLISHING.md section 4.2), add the link to the PR, mark the PR ready, share the credentials privately, then stop committing | **PO** | **Skipped on purpose for now.** Rehearse first on the live site in central Austin (see section 5) |

The 100% checklist rows that depend on R7 (the demo link plays without signing in; PR marked ready) stay open until then.

## 3. Task A data gaps (sent to the Task A session on 2026-10-25; the PO said not to wait)

1. `structure.roof_date` is empty for all 441,961 structures although `property.property_structure_built_year` is set for about 88% of properties. Roof ages exist only where Austin has a closed reroof permit (about 8,700 properties).
2. `ownerAreaClass` is `unknown` everywhere (300 of 300 sampled): the view stubs the mailing postal code, so "owners outside the area" cannot be answered (golden query G4 gets an honest `field_not_published`).
3. Tenure (`is_long_tenure`) is missing for 33 to 72% of sampled properties.
4. 51,900 properties (11.7%) have no coordinates, so they cannot appear on the map or in a radius search.
5. All 15,025 permits are City of Austin; no contractor is resolved (registry not wired) and BBB is not available.
6. Full-county manifests carry no `coverage.parcels_published` and no `travis-places` profile; the CRM handles both, but a parcel count would let consumers reconcile properties.

Re-check after each new run with the commands in section 1.1 and the counts in `docs/evidence/B-09.md`.

## 4. Deferred features (each needs an API or wire change; proposed shapes are in `design/board-match/ask.md` and `design/board-match/leads.md`)

- Ask: editable "Read as" assumption chips and Widen / use-place chips (need a structured plan-edit input on `agent.ask`), Cancel while working (needs a server-honoured abort), a low-confidence reason (`AgentAnswer.confidenceNote`), the Close-matches tab and a close-matches search API.
- Map: the Area and Sort menus, the pin explainer toast, in-ring chips, permit coverage hatching (no coverage areas published), the county outline and outside shading (review-log row 9), the GPS "explain first" card (needs the e2e to click Continue).
- Leads: multi-select status, Me / All reps and a rep directory (`users.list`), `leads.assign`, sort and permit-open filters on `leads.list`, numbered pages, row signal snapshots on the list (`signals`, `lastActivity`), `currentSignals` on `leads.get` (the Changed pill), View property and lineage links, a deleted-lead state, a place picker for "Within".
- Sign-in: the lockout banner that disables the form, the session-expired and signed-out banners, the "you return to" line.
- Conversation memory is one `THREAD#` item (last plan and proposals), not the full event store of ADR-06.

## 5. Known small issues

- The Gateway AI provider is wired but off: it needs `crm:aiGatewaySecretArn` (a Secrets Manager secret holding the key) and `AI_PROVIDER=gateway`; Bedrock stays live.
- Fixed on 2026-10-25 (kept here for the record): citation pill clipping, AI answer lost on resize, 15-minute Undo row, phone Filters sheet, lead-list filters in SQL, permit truncation notices, index warm-up plus 5-minute keep-warm. Re-measure cold start on the deployed Lambda (the local figure was 2.8 to 8.7 s cold, about 1 s warm).
- `search.permits` returns at most 500 rows (longest open first) and the UI says so; the permit page for a very large radius is a summary, not a full list.
- Every deploy starts one (no-op) sync because of the deploy nonce; a deploy while a sync of the same CID is running starts a second concurrent run (parts are content-addressed and Promote is conditional, so it is safe).
- If `getModel()` fails after the spend reservation, over-counting is possible only on misconfiguration (fixed by reordering; keep the test).

## 6. Cleanup and hygiene

- Retire the CI AWS access when the assessment is over: remove the `crm-ci` user from `infra/lib/crm-ci-user.ts`, redeploy, delete the repository secrets `CRM_CI_AWS_ACCESS_KEY_ID` and `CRM_CI_AWS_SECRET_ACCESS_KEY`.
- Close Docker Desktop after the last deploy (it is only needed to bundle the DuckDB Lambdas at deploy time); do not delete Task A's volumes.
- Tech debt list: `docs/decisions/tech-debt.md`.
- Commit rule reminder: no `#` followed by a number anywhere in commit text.

## 7. Demo rehearsal (not recorded yet)

A non-recorded rehearsal of the README Demo Transcript runs inside B-09 on the branch preview (its screenshots and findings go to `docs/evidence/B-09.md`). Before recording, repeat it once on `https://crm.aldarraj.com` after the merge and R4's login proof. Use central Austin for roof-age and permit steps (for example "roofs older than 20 years within 3 miles of Austin"; stalled and open permits cluster near latitude 30.35 longitude -97.74). Pflugerville, Manor and Lakeway answer with honest empties until Task A fills the roof dates. Keep the real-data numbers in `docs/evidence/B-09.md` open while presenting.

## 8. What the PO must provide

R3 (typing `/code-review ultra`), R6 (opening a fresh session), R7 (recording and marking the PR ready), creating the follow-up branch, the Run 3 CID when Task A publishes it, and any decision on the deferred features in section 4.
