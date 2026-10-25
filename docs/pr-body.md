# Roofing CRM, Travis County TX: all five stories built and proven on a hosted URL

> **Draft.** Stories B-01, B-02, B-03, B-07 and B-09 are built, reviewed and merged (`--no-ff`, one merge per story). Since 2026-10-25 the app serves Task A's full-county **Run 3** (contract v1.1) at **https://crm.aldarraj.com**. Still to do before this is ready for final review: the demo video, the self-score, and Task A's Run 3.1 (street addresses and owner ZIPs; see Known gaps).

## Outcome

A Roofing CRM that turns published Travis County property and permit data into roofing leads: a three-pane map with radius search, aged-roof and open-permit filters, a county overview, saved leads with status and notes, a browsable candidate and lead list, and an AI agent inside the map that answers plain-language questions with numbered, verified citations. Every value comes from the Oracle task's (Task A's) published CIDs, with provenance; a missing value says why. Live on real published data: **441,961 properties and 15,025 Austin roofing permits** (Task A run `travis-full-run2-20261024`).

## Links

| What | Where |
| --- | --- |
| Runtime (all five stories) | **https://crm.aldarraj.com** (Amplify, `eu-north-1`; certificate issued by Amazon, DNS at Namecheap). The build it serves is named at `/build.json`. Branch preview of the story branch: https://009-agent-hardening.d1zmhc6kkyzsbe.amplifyapp.com |
| Test credentials | Username `admin@roofing-crm.test`. The password is in AWS Secrets Manager (`roofing-crm/admin-user`, `eu-north-1`) and is shared privately with the assessor, never in this PR |
| Demo video | Not recorded yet (release step, listed in [`docs/pending-items.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/pending-items.md)) |
| Data source (Task A) | Run 3 manifest CID `bafkreifndsdibdllvgpzwmif6getzwvc6rupk5tgeak4eypccaw3t7vlfm`, run `travis-full-run3-20261025` (441,961 properties, 15,025 Austin roofing permits equal to Task A's `permits_emitted`; Run 2 `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute` is kept as `previous` for rollback). The sync reads the manifest named by `DATA_MANIFEST_CID`, checks every part's SHA-256 against it, and promotes the index only if the checks pass. Requests never go to Task A at run time |
| CI | GitHub Actions runs on the fork, so they do not appear in this PR's checks list: [all runs on `feature/roofing-crm`](https://github.com/HebaGaber/roofing-crm/actions?query=branch%3Afeature%2Froofing-crm). The last full run on the story branch (lint, type-check, unit tests, secret scan, and Playwright on the hosted URL: 152 passed in the parallel phase, 80 in the isolated phase, 0 failed) is [40167849532](https://github.com/HebaGaber/roofing-crm/actions/runs/40167849532) |

## Evaluation points

| Point | Story | Status | Evidence |
| --- | --- | --- | --- |
| B1 Location search | B-01, B-03 | Built and proven | [`docs/evidence/B-01.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-01.md), [`docs/evidence/B-03.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-03.md) |
| B2 Aged-roof leads | B-02, B-03 | Built and proven. On Run 3, 88 % of properties have a roof age, but 98 % of those are the year built (confidence Low, shown as "estimated from year built"); only 9,510 come from a closed roofing permit. Land parcels say "No building on this parcel" | [`docs/evidence/B-02.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-02.md), [`docs/evidence/B-03.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-03.md), [`docs/evidence/B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-09.md) |
| B3 Open permits, contractor, BBB | B-02, B-03 | Built and proven; the contractor shows as printed on the permit (unverified, 4,139 permits) with a BBB search link; no BBB rating exists (BBB blocks the lookup) and every missing value shows its reason | [`docs/evidence/B-03.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-03.md) |
| B4 CRM leads (create, no duplicates, status, notes) | B-07 | Built and proven: 20 of 20 executed cases pass; 20 concurrent creates give exactly 1 lead; lead creation, bulk create and Undo also work from the agent | [`docs/evidence/B-07.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-07.md), [`docs/reports/TR-B-07.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/reports/TR-B-07.md) |
| B5 RAG agent | B-09 | Built and proven on Run 2 (not yet re-run on Run 3): golden queries G1 to G7 and A1 to A5 pass (several as honest answers, for example "owner location is not published"); every cited row was checked against the index; p95 11.5 s on the timed asks | [`docs/evidence/B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-09.md), [`docs/reports/TR-B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/reports/TR-B-09.md) |
| B6 Candidate list, combined filters, scale, responsive, observable | B-07, B-09, B-01 | List and filters proven on the full county; radius searches take about 1 s at p50 and 1.3 s at p95 (6 to 25 mi); responsive checks at 360, 390, 600, 768, 1280 and 1440 px; DLQ alarm fired and recovered. The test cases that are not proven are listed in Known gaps | [`docs/evidence/B-07.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-07.md), [`docs/evidence/B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-09.md) |

The README criterion-by-criterion matrix is [`docs/traceability.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/traceability.md).

## Story status

| Story | Status | Merge commit | Gate |
| --- | --- | --- | --- |
| B-01 CRM shell | Done | `fcd6d6a` | G7 |
| B-02 Lead search index | Done | `d01c06e` | G7 |
| B-03 Map search (radius, roof age, permits, detail) | Done | `80873e1` | G7 |
| B-07 Leads and lead list | Done | `8b13240` | G7 approved with exceptions |
| B-09 Agent and hardening | Done | `ab6f520` | G6 and G7 approved with exceptions (below) |

## Verification

| What | Result |
| --- | --- |
| Unit and integration tests | 1,743 passed, 0 failed across 179 test files; new code at or above 80 % coverage ([`docs/reports/UT-B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/reports/UT-B-09.md)) |
| Hosted end-to-end, mobile 390 / tablet 768 / desktop 1440 | 152 passed in the parallel phase and 80 in the isolated phase, 0 failed (run 40167849532); fixtures were refreshed to Run 3 on 2026-10-26 and a fixture-validity spec fails with refresh steps if the served data changes |
| Golden queries on the deployed agent | G1 to G7 and A1 to A5 pass on Run 2 after six passes; latency p95 11.5 s on 7 timed asks; the details and the answers that are honest empties are in [`docs/evidence/B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/evidence/B-09.md) |
| Code review | B-09 final re-score: `alakazam` 84, `ash` 87, `metagross` 88, `audino` 82, `porygon` 84, plus `/code-review medium` on the final code (8 follow-ups, none Critical); no open Critical ([`docs/reviews/CR-B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/reviews/CR-B-09.md)) |
| Defects | Every recorded defect is closed ([`docs/defects/`](https://github.com/HebaGaber/roofing-crm/tree/feature/roofing-crm/docs/defects/)). Found only on the live stack and fixed in this round: lead Undo failed on the real table (a DynamoDB reserved word), the agent could not check or propose leads (lead repository missing from the Lambda context), the sync failed on a result-size limit, and whole-county searches ran out of memory |

## Architecture

Decided and approved at G3: [`docs/architecture-constitution.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/architecture-constitution.md). Search runs in DuckDB over a CRM-owned Parquet index built by a Step Functions sync from Task A's published data; leads live in DynamoDB with a conditional-write transaction that refuses duplicates (key `{fips}:tcad:{request_identifier}`).

Golden Path: TypeScript · CDK (region from config; demo in `eu-north-1` because the demo AWS project is region-locked, company default `us-east-2`) · Turborepo · tRPC + Zod · Vercel AI SDK · Powertools + X-Ray · Vitest + Playwright in GitHub Actions.

## Delivery process

| What | Where |
| --- | --- |
| Vision, feature list, plan, architecture (G0 to G3, approved) | [`docs/01-intent.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/01-intent.md), [`docs/feature-list.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/feature-list.md), [`docs/plan.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/plan.md), [`docs/architecture-constitution.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/architecture-constitution.md) |
| Gate log | [`docs/traceability.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/traceability.md) § 3, pre-checks in [`docs/gates/`](https://github.com/HebaGaber/roofing-crm/tree/feature/roofing-crm/docs/gates/) |
| Story progress and git graph | [`docs/progress.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/progress.md) |
| Test cases and execution reports | [`testplans/`](https://github.com/HebaGaber/roofing-crm/tree/feature/roofing-crm/testplans/), [`docs/reports/`](https://github.com/HebaGaber/roofing-crm/tree/feature/roofing-crm/docs/reports/) |
| Code review logs and defects | [`docs/reviews/`](https://github.com/HebaGaber/roofing-crm/tree/feature/roofing-crm/docs/reviews/), [`docs/defects/`](https://github.com/HebaGaber/roofing-crm/tree/feature/roofing-crm/docs/defects/) |
| Per-story evidence | [`docs/evidence/`](https://github.com/HebaGaber/roofing-crm/tree/feature/roofing-crm/docs/evidence/) |

## Kit usage

See [`docs/kit-usage.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/kit-usage.md).

## Known gaps

Every recorded gap, with its cause and what closes it, is in [`specs/007-leads/known-gaps.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/specs/007-leads/known-gaps.md) and [`docs/pending-items.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/pending-items.md). The ones that matter most:

| Gap | Why | Next step |
| --- | --- | --- |
| Demo video and self-score | Not recorded or written yet | Release steps R1 to R7 on the follow-up branch |
| Test cases not proven (9 of 33 in B-09): TC-002 Open on map, TC-017 throttled and paused states at three widths, TC-019b, TC-024 timeout state in the browser, TC-NF-01 as specified (39 asks times 3 repeats; run once per query), and four design sign-offs | Approved as exceptions by the PO on 2026-10-25 | Listed in [`docs/reports/TR-B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/reports/TR-B-09.md) |
| Task A data gaps in Run 3: no street address and no owner mailing ZIP for any property (Task A fills both in Run 3.1, contract v1.2), no roof date from TCAD (built year stands in), 7,945 properties without coordinates, contractors only as printed and unverified, no BBB rating | Task A's published data | Reported to the Task A session; the app shows "not published" with a reason, and the agent says so instead of guessing (golden query G4) |
| Final code review follow-ups (8): query timeout shares one database connection, four index methods without a time limit, and smaller items | Found by `/code-review medium` on the final code; none Critical | [`docs/reviews/CR-B-09.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/reviews/CR-B-09.md), [`docs/pending-items.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/pending-items.md) |
| Scale: AC-4 at 50+ leads and list-load timing with 50+ leads | Decided by the PO as deferred, not passed; the full county is now loaded, so these can be run | Run them on the follow-up branch |
| `leads.create` trusts the property details the client sends; no per-lead ownership checks | Not decided or built yet | The follow-up story |
| No street address in Run 3 | Task A's Parquet tables drop the address text (export-tool limit); Run 3.1 publishes it | Shown as "not available" with a reason; fills in when Task A publishes them |
| CI reaches AWS with a long-lived access key of a narrowly scoped IAM user (`crm-ci`) | The organization policy blocks the GitHub-to-AWS role, so OIDC is not possible | The key can only read and delete test leads and publish metrics; it is retired after the final CI run (listed in [`docs/pending-items.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/pending-items.md)) |
| Run 3 handling and the release steps R1 to R7 (self-score, demo video, marking the PR ready) | Run 3 is live; the release steps were moved out of B-09 by the PO | Listed with their steps in [`docs/pending-items.md`](https://github.com/HebaGaber/roofing-crm/blob/feature/roofing-crm/docs/pending-items.md), for the follow-up branch |
| Incremental Task A runs (Run 3+) are not followed yet | Task A publishes only changed data groups per run, linked by `previousManifestCid`; the sync reads one manifest, so a delta-only run is held and the CRM stays on the last good run | Deferred by the PO: chain-following ships as an update after Tasks A and B, with the "coming soon" sections |
| Lambda concurrency is 10 on this Free-plan account | Raising it needs a paid plan | The 20-concurrent-create test retries throttled calls and still proves exactly one winner |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
