# Roofing CRM, Travis County TX: work in progress (planning done up to G3)

> **Draft.** This PR is open as a draft while the stories are built. It is not ready for review. Planning gates G0–G2 and the design checkpoint are approved. No story (B-01 to B-09) is built yet, so there is no hosted runtime, no credentials and no demo video.

## Outcome so far

A Roofing CRM that turns published Travis County property and permit data into roofing leads, through four steps: a map, filters, saved leads and a source-backed agent. Every value it shows comes from the Oracle task's (Task A's) published CIDs or its MCP, with provenance. This PR records the plan, the design and the architecture consults. The code follows story by story.

## Links

| What | Where |
| --- | --- |
| Runtime | Not deployed yet. Planned at `https://crm.aldarraj.com` (B-01) |
| Test credentials | Not created yet (B-01). They will be shared privately with the assessor, never in this PR |
| Demo video | Not recorded yet (release) |
| Data source (Task A) | Oracle manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` (run `travis-202609-permits-20261021t103516z`: 35 Austin reroof permits on 14 TCAD parcels). Task A is built in parallel; its later runs are picked up by re-sync |

## Evaluation points

Evaluation points B1–B6 are defined in [`docs/01-intent.md`](docs/01-intent.md) § 8. No evaluation point is covered yet. Coverage is tracked in [`docs/traceability.md`](docs/traceability.md).

## Delivery process

| What | Where |
| --- | --- |
| Vision (G0, approved) | [`docs/01-intent.md`](docs/01-intent.md), pre-check [`docs/gates/G0-VIS-B-precheck.md`](docs/gates/G0-VIS-B-precheck.md) |
| Feature list (G1, approved) | [`docs/feature-list.md`](docs/feature-list.md), pre-check [`docs/gates/G1-FL-B-precheck.md`](docs/gates/G1-FL-B-precheck.md) |
| High-level plan (G2, approved) | [`docs/plan.md`](docs/plan.md), pre-check [`docs/gates/G2-PROJ-B-precheck.md`](docs/gates/G2-PROJ-B-precheck.md) |
| Design checkpoint (approved) | [`design/`](design/), review log [`design/design-review-log.md`](design/design-review-log.md) |
| Architecture consults (input to G3) | [`docs/decisions/0000-agent-architecture.md`](docs/decisions/0000-agent-architecture.md): metagross, alakazam, espeon and mew, word for word, then "Where the answers disagree" (D1–D8) |
| Gate log | [`docs/traceability.md`](docs/traceability.md) § 3 |
| Story progress and git graph | [`docs/progress.md`](docs/progress.md), one `--no-ff` merge per story on `feature/roofing-crm` |

## Story status

| Story | Status |
| --- | --- |
| B-01, B-02, B-03, B-07, B-09 | Not started (drafts after G3) |

## Architecture

Not decided yet. G3 decides it in `docs/architecture-constitution.md`, starting from the consults and the open decisions D1–D8 in [`docs/decisions/0000-agent-architecture.md`](docs/decisions/0000-agent-architecture.md). D1 (search store) is the main one: DuckDB over a CRM-owned Parquet index, or OpenSearch.

Golden Path: TypeScript · CDK (region from config; demo in `eu-north-1` because the demo AWS project is region-locked, company default `us-east-2`) · Turborepo · tRPC + Zod · Vercel AI SDK · Powertools + X-Ray · SQS + DLQ alarms · Vitest + Playwright in GitHub Actions.

## Kit usage

See [`docs/kit-usage.md`](docs/kit-usage.md).

## Known gaps

| Gap | Why | Next step |
| --- | --- | --- |
| No runtime, credentials or demo video | No story built yet | B-01 (shell, sign-in, hosting), then B-02 onward |
| Thin data (14 parcels) | Task A has published only its walking-skeleton run so far; the full county comes with Task A's A-11 | The CRM re-syncs when Task A publishes; the demo area is picked from real data at release |
| Architecture constitution (G3) | Waiting on the PO's decisions D1–D8 | G3 |
