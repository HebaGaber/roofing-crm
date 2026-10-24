---
id: CR-B-09
type: code-review-log
story: B-09
branch: 009-agent-hardening
reviewed_commit: a769cc4 (re-scored at d78de40)
tools: [/code-review medium, soofi-xyz-team-kit:alakazam, soofi-xyz-team-kit:ash, soofi-xyz-team-kit:metagross, soofi-xyz-team-kit:audino, soofi-xyz-team-kit:porygon]
created: 2026-10-24
---

# Code Review Log: B-09 Agent and hardening (parts B-09 and B-11)

One review round, five kit reviewers plus `/code-review medium`, all read-only, in parallel, on the diff `feature/roofing-crm...009-agent-hardening` at `a769cc4`. Live data (Task A Run 2) is not online yet, so reviewers judged the code, not live answers.

## Reviewer scores

| Reviewer | Lens | Score | Pass mark | Re-score needed |
| --- | --- | --- | --- | --- |
| `alakazam` | retrieval, grounding, confidence bands | **72 / 100**, re-scored **80** | 75 | done |
| `ash` | agent runtime, limits, timeouts | **62 / 100**, re-scored **86** | 75 | done |
| `metagross` | infra, CDK, monorepo, Ask UI wiring | **68 / 100**, re-scored **84** | 75 | done |
| `audino` | design fidelity, Atlas, states | **72 / 100**, re-scored **88** | 75 | done |
| `porygon` | metrics, dashboard, count reconciliation | **58 / 100**, re-scored **88** | 75 | done |
| `/code-review medium` | correctness | 10 ranked findings, no score | n/a | no |

Every reviewer is under 75, so every Critical and every deviation from these reviewers is fixed in one fixer round (one fixer per builder), then only these reviewers re-score.

## Findings and fix owner

| # | Severity | Finding | Raised by | Fixer | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Critical | API Lambda timeout 10 s; the agent turn is sized for a 23 s abort inside a 28 s Lambda (`infra/lib/crm-api-stack.ts:84`) | /code-review, ash, metagross | ash | fixed |
| 2 | Critical | No `bedrock:InvokeModel*` grant on the API Lambda; Gateway key not wired (`crm-api-stack.ts`) | /code-review, ash, metagross | ash | fixed |
| 3 | Critical | Dashboard latency and groundedness widgets and the groundedness alarm query dimensions that are never emitted, so the alarm can never fire (`crm-ops-stack.ts`) | porygon | metagross | fixed |
| 4 | Major | Rate limit / over budget thrown as `TRPCError`, so the Ask screen never shows its throttled / paused states; those outcomes count as `error` in metrics (`routers/agent.ts`) | /code-review, ash, porygon | ash | fixed |
| 5 | Major | Usage guard fails open when its table name is unset (`routers/agent.ts`) | ash | ash | fixed |
| 6 | Major | Spend cap reserves a flat 1 cent per ask and never reconciles with real token cost (`routers/agent.ts`, `runAgent.ts`) | /code-review, ash | ash | fixed |
| 7 | Major | `confirmLead` writes (0,0) when coordinates are missing, does not check the tcadId was proposed in the thread, and has no rate limit (`routers/agent.ts`) | /code-review, ash | ash | fixed |
| 8 | Major | Permit citations looked up as property citations first and dropped (`composeAnswer.ts:656`) | /code-review | alakazam | fixed |
| 9 | Major | Scope gate runs place resolution for every intent, so lookup / coverage questions fail (`composeAnswer.ts`) | /code-review, alakazam | alakazam | fixed |
| 10 | Major | Counts, `missing` and outcome come only from property search counts; permit and lookup answers report 0 matched; exclusions hard-coded to 0 (`composeAnswer.ts`) | /code-review, alakazam | alakazam | fixed |
| 11 | Major | Claim text is not checked against cited rows (numbers, names) | alakazam | alakazam | fixed |
| 12 | Major | Deploy-time sync start reuses the CID as execution name, so a failed first sync or an A→B→A rollback never re-syncs (`crm-sync-stack.ts`) | /code-review | metagross | fixed |
| 13 | Major | Validate runs no property-count check for a first full-county run, and an unresolved county batch is skipped silently (`validate.ts`, `bindManifest`) | /code-review | metagross | fixed |
| 14 | Major | Alarm email hard-coded in `infra/src/app.ts` instead of config | metagross | metagross | fixed |
| 15 | Major | `AgentTimeouts` / `AgentThrottled` / `AgentOverBudget` in the contract but never emitted; contract dimension columns wrong | porygon | metagross (contract + dashboard), ash (emit by `outcome`) | fixed |
| 16 | Major | Ask: "How I read this" shown on system-limit outcomes; empty-result copy does not say why; no candidate-place buttons for clarification; place / limits hard-coded in copy | audino, alakazam | metagross (web), after alakazam | fixed |
| 17 | Minor | Groundedness averaged per answer instead of Sum(verified)/Sum(total); planted citations filtered before counting | porygon, alakazam | metagross, alakazam | fixed |
| 18 | Minor | `GoldenQueryPassRate` literal repeated; publisher never invoked | porygon | metagross | fixed |
| 19 | Minor | Type casts (`as unknown as`) in infra and `askApi.ts` | metagross | metagross | fixed |
| 20 | Minor | Ask: working state has no progress indicator; focus not moved to the result; comments cite the wrong prototype files | audino | metagross (web) | fixed |

Fix waves (so no two fixers edit the same file at once): wave 1 `ash` + `metagross` (infra, sync, metrics); wave 2 `alakazam` (answer composition); wave 3 `metagross` (Ask screen).

## Re-score on the fixed head (`d78de40`, 2026-10-24)

All five kit reviewers re-read the code at `d78de40`, confirmed each of their findings fixed in the code (with file and line evidence), and found no new Critical or Major issue. Fixes landed in `56222d5` (ash), `d81b380` (metagross, infra/sync/metrics), `84a23be` (alakazam), `d78de40` (metagross, Ask screen), plus `15f3ab9` (ERR-21, found by the PO on the preview). Deployed to the hosted stack; a live `agent.ask` through Bedrock returned HTTP 200 in 5.3 s.

Remaining Minor / Low notes (not blocking G7):

| Note | Raised by | Disposition |
| --- | --- | --- |
| `AGENT_TURN_LIMIT_SEC = 23` in the web app mirrors the server's `RUN_AGENT_TIMEOUT_MS`; no shared constant or contract test | audino | follow-up: move to `packages/shared` |
| Conversation memory is one `THREAD#` item (last plan + proposals), not a full event store | ash | accepted for v1; ADR-06 few-shot reuse not built |
| If `getModel()` throws after the spend reservation, the reservation is not reconciled (over-counts) | ash | follow-up, misconfiguration-only |
| `citationsVerified` stays 0 when the template answer replaces failed claims (under-reports groundedness) | alakazam | accepted, conservative |
| Unnamed place with no previous plan returns needs_clarification with empty candidates | alakazam | UI shows the "name a place" message (wave 3) |
| Per-answer `AgentCitationGroundednessRate` logs 100 for 0-of-0 answers (log-only; dashboard/alarm use Sum/Sum) | porygon | accepted |
| The alarm's citing-outcome list must track any new citing path | porygon | noted in code |
| Every deploy starts one (no-op) sync because of the deploy nonce | metagross | by design |
| Three `as unknown as` casts remain outside B-09's files (`leadsApi.ts`, `CrmMap.tsx`, `auth/config.ts`) | metagross | follow-up |
