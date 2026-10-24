# Roofing CRM, Travis County TX: four of five stories built and proven on a hosted URL

> **Draft.** Stories B-01, B-02, B-03 and B-07 are built, reviewed and merged (`--no-ff`, one merge per story). **B-09 (the source-backed agent) is not started**, and there is no demo video yet. Not ready for final review.

## Outcome so far

A Roofing CRM that turns published Travis County property and permit data into roofing leads: a map with radius search, aged-roof and open-permit filters, saved leads with status and notes, and a browsable lead list. Every value comes from the Oracle task's (Task A's) published CIDs, with provenance; a missing value says why. Live at **https://crm.aldarraj.com** on real published data (14 properties, 35 permits).

## Links

| What | Where |
| --- | --- |
| Runtime (contains B-01, B-02, B-03 and B-07) | **https://crm.aldarraj.com** (Amplify, `eu-north-1`; certificate issued by Amazon, DNS at Namecheap). Fallback: https://feature-roofing-crm.d1zmhc6kkyzsbe.amplifyapp.com, the same build of this PR's branch |
| Test credentials | Username `admin@roofing-crm.test`. The password is in AWS Secrets Manager (`roofing-crm/admin-user`, `eu-north-1`) and is shared privately with the assessor, never in this PR |
| Demo video | Not recorded yet (release) |
| Data source (Task A) | Oracle manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` (run `travis-202609-permits-20261021t103516z`: 35 Austin reroof permits on 14 TCAD parcels). Task A's full-county run (A-11) is not picked up yet: that switch is a later story |
| CI | GitHub Actions run on the fork, so they do not appear in this PR's checks list: [all runs on `feature/roofing-crm`](https://github.com/HebaGaber/roofing-crm/actions?query=branch%3Afeature%2Froofing-crm), green on this branch: lint, type-check and unit tests; secret scan (gitleaks); and Playwright on the hosted URL (run [40087783428](https://github.com/HebaGaber/roofing-crm/actions/runs/40087783428)) |

## Evaluation points

| Point | Story | Status | Evidence |
| --- | --- | --- | --- |
| B1 Location search | B-01, B-03 | Built and proven | [`docs/evidence/B-01.md`](docs/evidence/B-01.md), [`docs/evidence/B-03.md`](docs/evidence/B-03.md) |
| B2 Aged-roof leads | B-02, B-03 | Built and proven on the 14-property sample | [`docs/evidence/B-02.md`](docs/evidence/B-02.md), [`docs/evidence/B-03.md`](docs/evidence/B-03.md) |
| B3 Open permits, contractor, BBB | B-02, B-03 | Built and proven; contractor name and BBB rating show "not published / not available" with a reason because the sample carries none | [`docs/evidence/B-03.md`](docs/evidence/B-03.md) |
| B4 CRM leads (create, no duplicates, status, notes) | B-07 | Built and proven: 20 of 20 executed cases pass; 20 concurrent creates give exactly 1 lead | [`docs/evidence/B-07.md`](docs/evidence/B-07.md), [`docs/reports/TR-B-07.md`](docs/reports/TR-B-07.md) |
| B5 RAG agent | B-09 | **Not started** | n/a |
| B6 Candidate list, combined filters, scale | B-07 (lead list), B-01 (disabled roadmap sections) | List and filters proven; **scale (50+ leads) is deferred**, see Known gaps | [`docs/evidence/B-07.md`](docs/evidence/B-07.md) |

The README criterion-by-criterion matrix is [`docs/traceability.md`](docs/traceability.md).

## Story status

| Story | Status | Merge commit | Gate |
| --- | --- | --- | --- |
| B-01 CRM shell | Done | `fcd6d6a` | G7 |
| B-02 Lead search index | Done | `d01c06e` | G7 |
| B-03 Map search (radius, roof age, permits, detail) | Done | `80873e1` | G7 |
| B-07 Leads and lead list | Done | `8b13240` | G7 approved with exceptions (below) |
| B-09 Agent and hardening | Not started | n/a | n/a |

## Verification

| What | Result |
| --- | --- |
| Unit and integration tests | 845 passed, 0 failed, every B-07 lead file at or above 80 % coverage ([`docs/reports/UT-B-07.md`](docs/reports/UT-B-07.md)) |
| Hosted end-to-end, every story, mobile 390 / tablet 768 / desktop 1440 | 136 passed, 17 skipped (documented), 0 failed |
| CI on this branch | Green on all three jobs (lint, type-check and unit tests; gitleaks; Playwright on the hosted URL). The logged-in lead tests (B-07) skip on GitHub Actions by design, see Known gaps, and are proven by the hosted run above |
| Code review | B-07: `metagross` 85, `audino` 86 (both re-scored after fixes), `/code-review medium`; no open Critical ([`docs/reviews/CR-B-07.md`](docs/reviews/CR-B-07.md)) |
| Defects | 20 recorded and closed for B-07's round ([`docs/defects/`](docs/defects/)), including a real bug found only on the live site (the map covered the "Widen" button on a 1440×900 screen) |

## Architecture

Decided and approved at G3: [`docs/architecture-constitution.md`](docs/architecture-constitution.md). Search runs in DuckDB over a CRM-owned Parquet index built by a Step Functions sync from Task A's published data; leads live in DynamoDB with a conditional-write transaction that refuses duplicates (key `{fips}:tcad:{request_identifier}`).

Golden Path: TypeScript · CDK (region from config; demo in `eu-north-1` because the demo AWS project is region-locked, company default `us-east-2`) · Turborepo · tRPC + Zod · Vercel AI SDK · Powertools + X-Ray · Vitest + Playwright in GitHub Actions.

## Delivery process

| What | Where |
| --- | --- |
| Vision, feature list, plan, architecture (G0 to G3, approved) | [`docs/01-intent.md`](docs/01-intent.md), [`docs/feature-list.md`](docs/feature-list.md), [`docs/plan.md`](docs/plan.md), [`docs/architecture-constitution.md`](docs/architecture-constitution.md) |
| Gate log | [`docs/traceability.md`](docs/traceability.md) § 3, pre-checks in [`docs/gates/`](docs/gates/) |
| Story progress and git graph | [`docs/progress.md`](docs/progress.md) |
| Test cases and execution reports | [`testplans/`](testplans/), [`docs/reports/`](docs/reports/) |
| Code review logs and defects | [`docs/reviews/`](docs/reviews/), [`docs/defects/`](docs/defects/) |
| Per-story evidence | [`docs/evidence/`](docs/evidence/) |

## Kit usage

See [`docs/kit-usage.md`](docs/kit-usage.md).

## Known gaps

Every recorded gap, with its cause and what closes it, is in [`specs/007-leads/known-gaps.md`](specs/007-leads/known-gaps.md). The ones that matter most:

| Gap | Why | Next step |
| --- | --- | --- |
| B-09 agent (B5) and the demo video | Not built or recorded yet | B-09, then release |
| Scale: AC-4 at 50+ leads and list-load timing with 50+ leads (decided by the PO as deferred, not passed) | The sample holds 14 properties; the full county comes with Task A's A-11, whose manifest is not yet verified | A later story: verify the A-11 manifest, re-sync, re-run those cases |
| `leads.create` trusts the property details the client sends; no per-lead ownership checks | Not decided or built yet | The follow-up story |
| No street address, contractor name or BBB rating in the sample | Task A's contract v1 publishes none | Shown as "not available" with a reason; fills in when Task A publishes them |
| B-07's logged-in end-to-end spec does not run on GitHub Actions | CI has no AWS credentials to clear its test leads, and the organization policy blocks the GitHub-to-AWS role | Its proof is the hosted run recorded in `docs/evidence/B-07.md`; revisit if the policy changes |
| Lambda concurrency is 10 on this Free-plan account | Raising it needs a paid plan | The 20-concurrent-create test retries throttled calls and still proves exactly one winner |
