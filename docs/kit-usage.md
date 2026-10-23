# Kit Usage

Built with the [soofi-xyz team kit](https://github.com/soofi-xyz/soofi-xyz-team-kit), installed at project scope (see `.claude/settings.json`).

*Story merge (2026-10-21, before P8):* the 11 stories run as 5 merged stories. Story IDs here are **part** IDs: B-10 → B-01 · B-04, B-05, B-06 → B-03 · B-08 → B-07 · B-11 → B-09. Evidence for a part goes in its merged story's file, one section per part (for example `docs/evidence/B-03.md` § B-04).

Every story also loads `apply-engineering-guidelines`. Agents follow `../assessment-guide/AGENT-MAP.md` § 5, as updated after the P1 routing check below.

| Story | Primary agent | Skills loaded | Reviewer | What the kit decided or produced |
| --- | --- | --- | --- | --- |
| B-01 Walking skeleton | `metagross` | `build-frontend-backends`, `integrate-ci-cd` | `metagross` | Turborepo + Cognito + MapLibre shell live at RUNTIME_URL; lockout redesigned mid-build (client-reported failures, server-enforced block) after `metagross`'s original PreAuthentication-only design proved a no-op against real Cognito |
| B-02 Lead search index | `espeon` (index), `machamp` (batch); design with `alakazam` | `build-local-rag-pocs`, `build-rag-systems`, `build-batch-workflows`, `unify-metrics`, `use-elephant-mcp` | `espeon`, `alakazam`, `machamp`, `porygon`, `donphan` | espeon's local prototype (`scripts/local-rag-poc`) proved the query path against `contract/v1/sample.parquet` before any AWS resource existed, per `build-local-rag-pocs` discipline. ADR-01 (DuckDB over Parquet, no OpenSearch) and ADR-07 (vendor `query-core`/`contract`, never re-implement) both held through the build. E1 review found 3 Critical findings (propertyCount never persisted, ADR-02's CloudFront gateway never wired, a dead diverging cost gate); E2 fixed all of them and a later `/speckit-converge` round closed two more CRITICAL gaps the kit's own review scope hadn't covered (the manifest's own bytes were never verified against its CID — only downstream parts were; the API's `LeadIndex` port wasn't wrapped with the required Powertools observability). `donphan`'s MCP cross-check (AC-2) is the one mechanism built-but-unexercised: Travis County isn't yet published to this environment's Elephant MCP index. Final reviewer scores: espeon 90, alakazam 90, donphan 91, machamp 86, porygon 82 — all ≥75. |
| B-03 Radius search | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Two parallel `metagross` builder groups converged cleanly on one shared `packages/domain`. First review found a Critical: the built UI (FilterSheet/ResultRow/PermitChip/PropertyDetail) was never wired into `Map.tsx`, which rendered a hand-rolled list instead — fixed, `audino` re-scored 48→84. User then compared the live preview directly against the real design prototype (not just the thin `.dc.html` wrappers) and found it structurally unlike it; a full UI rebuild against the actual served prototype boards followed, then a second `audino` full re-review (81/100) plus `smeargle`'s responsive pass found and fixed remaining token/tap-target issues. Also found and fixed, live: the shared tRPC client never attached the Cognito session (every authenticated call 401'd — nothing in this repo had exercised one before), a CDK Docker-bundling gap for `@duckdb/node-api` on the API Lambda, `indexInfo()` not catching `crm-leads`'s `ResourceNotFoundException` (B-07's table isn't deployed yet — GAP-7, affects every story), and a flat-color map (wrong free tile-style choice for this story's zoom level). |
| B-04 Roof age | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Merged into B-03's single build/review round above; see that row. |
| B-05 Open permits | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Merged into B-03's single build/review round above; see that row. |
| B-06 Permit + contractor + BBB | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | Merged into B-03's single build/review round above; see that row. |
| B-07 Leads | `metagross`; design with `mew` | `build-frontend-backends`, `use-neutral-lexicon` | `metagross` | — |
| B-08 Lead list | `metagross` | `build-frontend-backends`, `frontend-bug-fix` | `metagross`, `audino` | — |
| B-09 Agent | `alakazam` (retrieval), `ash` (runtime) | `build-rag-systems`, `build-ai-agents`, `use-elephant-mcp` | `alakazam`, `ash` | — |
| B-10 Disabled sections | `metagross` | `build-frontend-backends` | `metagross`, `audino` | Shared `NavRow` (`aria-disabled`, tooltip, still interactive) reused unmodified between the nav rail and the 390 px "More" sheet; `smeargle` responsive pass clean after 2 Atlas-token fixes |
| B-11 Responsive + observable | `metagross`; design with `smeargle`, `porygon` | `responsive-design-tests`, `unify-metrics`, `build-frontend-backends` | `metagross`, `audino`, `porygon` | — |

`smeargle` runs the responsive suite on every `ui: true` story. Whole-repo moments: `arceus` at P1, `slowking` at R6.

## Routing decisions (P1, 2026-10-20)

`arceus` was asked for the Task B routing without seeing the agent map (full answer in `docs/01-intent.md` § 13). Differences and decisions:

| Agent or skill | Difference | Decision |
| --- | --- | --- |
| `donphan` | Named by arceus; the map used it in Task A only | Reviews B-02: confirms index count = Oracle count through the MCP |
| `klefki` | Named by arceus; not in the map | Left out: a file-sharing portal builder. B-01 sign-in is a plain Cognito login built by `metagross` |
| `porygon` | In the map; not named by arceus | Kept: reviews B-02 and B-11 (`unify-metrics`) |
| `mew` | In the map; not named by arceus | Kept: designs the B-07 lead model (`use-neutral-lexicon`) |
| `ash` | In the map; not named by arceus | Kept: builds the B-09 agent runtime with `alakazam` |
| `use-elephant-mcp` | Named by arceus; not in the map for Task B | Added to B-02 and B-09 |

Also left out, as arceus advised: `oracle` and the county ingestion skills (outside the access boundary), `kangaskhan`, `blissey`, `conkeldurr`, `uxie` (Prism platform products this app doesn't use).

## Reviewer scores before submission

| Agent | Score (0–100) | Main deviations fixed |
| --- | --- | --- |
| `metagross` (B-02) | 90 | — |
| `metagross` (B-03) | 80 | Stale self-disclosure comment after an already-fixed CDK gap; double DuckDB pass for fresh counts (accepted, matches FR-004); BBB/contractor collapsed to `permits[0]` (accepted v1 shortcut) |
| `espeon` | 90 | — |
| `alakazam` | 90 | — |
| `machamp` | 86 | — |
| `porygon` | 82 | — |
| `donphan` | 91 | — |
| `audino` (B-03, round 1) | 48→84 | Critical: built UI never wired into `Map.tsx` (fixed) |
| `audino` (B-03, full re-review after rebuild) | 81 | Shape-token misuse surviving the rebuild, 2 new hardcoded values, a phantom board name — all fixed |
| `ash` | — | — |
