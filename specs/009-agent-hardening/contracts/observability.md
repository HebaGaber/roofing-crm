# Contract: `RoofingCrm` dashboard, DLQ alarm, and agent metrics

Not a tRPC surface — the interface here is the CloudWatch namespace/dashboard/alarm contract
`metagross` builds to and `porygon` reviews against, per `agent-design.md` §4.

## DLQ + alarm (AC-6) — confirm, don't rebuild

**Existing** (`infra/lib/crm-sync-stack.ts`, `addFetchPartDlqAndAlarm()`): `FetchPartDlq` (SQS,
14-day retention), `FetchPartDlqAlarm` on `ApproximateNumberOfMessagesVisible > 0` for 1 period,
`treatMissingData: NOT_BREACHING` — self-resolves to OK the moment depth returns to 0, no custom
logic needed. `CrmSyncStack` already accepts `alarmEmail` → SNS `EmailSubscription`.

**Task**: confirm the deployed stack composition (`infra/bin/*.ts`) actually passes `alarmEmail:
"eng.heba.gaber@gmail.com"`. If it's omitted, that one-line fix is the whole AC-6 DLQ task — no new
construct.

## Agent metrics (namespace `RoofingCrm`, Powertools `createObservability("crm-api")`)

| Metric | Unit | Dimensions | Emitted from |
| --- | --- | --- | --- |
| `AgentAsksTotal` | Count | `outcome` | `agent.ts`, every `agent.ask` call |
| `AgentAnswerLatencyMs` | Milliseconds | `outcome` | `agent.ts`, drives AC-4 p95 |
| `AgentModelCallsTotal` | Count | — | `agent.ts`, tracks the ≤3-call NFR |
| `AgentCitationsTotal` / `AgentCitationsVerified` | Count | — | citation verifier, per answer |
| `AgentCitationGroundednessRate` | Percent (0–100) | — | `Verified/Total`, per answer — ADR-06's `GroundednessViolations` is the inverse signal (count of claims dropped) |
| `AgentLeadsProposed` | Count | — | `proposeLeads` tool |
| `AgentTimeouts` / `AgentThrottled` / `AgentOverBudget` | Count | — | abort/rate-limit/spend-cap paths |

No per-`property_cid` dimension — high-cardinality, unsuitable for a CloudWatch dashboard
(`porygon`'s design note).

## `RoofingCrm` dashboard (`infra/lib/crm-ops-stack.ts`)

`cloudwatch.Dashboard(this, "RoofingCrmDashboard", {dashboardName: "RoofingCrm"})`. Widgets:

1. DLQ depth (`fetchPartDlq.metricApproximateNumberOfMessagesVisible()`)
2. `AlarmStatusWidget` for `FetchPartDlqAlarm`
3. `AgentAnswerLatencyMs` p95
4. `AgentCitationGroundednessRate` (target line 100)
5. `GoldenQueryPassRate` (custom metric, `PutMetricData`d by the CI/golden harness after each run
   — so the widget reflects the last real run, not just a green CI badge)

## Continuous AC-4 check (not just a merge-time test)

Three layers sharing one definition (cited `property_cid` ∈ current index):
1. CI: `tests/agent/golden.json` + Vitest against the deployed endpoint (checks.md §7.2) — gates merges.
2. Runtime: `AgentCitationGroundednessRate` per real `agent.ask` call, with its own CloudWatch
   alarm (`< 100` for N periods → same SNS topic as the DLQ alarm) so citation drift pages, rather
   than only failing a nightly test quietly.
3. Dashboard: `GoldenQueryPassRate` trended over time, not a one-time checkmark.
