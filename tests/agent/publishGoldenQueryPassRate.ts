// B-09 T054 (US3; contracts/observability.md "Continuous AC-4 check" layer 3; agent-design.md
// porygon §4): publishes `GoldenQueryPassRate` (namespace `RoofingCrm`, the same namespace every
// other agent metric already uses — packages/observability/src/index.ts's `METRICS_NAMESPACE`)
// so the `RoofingCrm` dashboard's golden-query widget (infra/lib/crm-ops-stack.ts T053) reflects
// the last real harness run instead of only a green/red CI badge with no visible trend.
//
// A thin, reusable function rather than inline PutMetricData calls in golden.test.ts, so a CI
// wrapper step can also call it after a scheduled (non-Vitest) re-run of the same harness, per
// this task's own "(or a thin wrapper script run after it in CI)" allowance.
//
// This cannot actually run in this development session: there is no deployed RUNTIME_URL, no
// golden-harness run to report on, and no AWS credentials profile wired into this workspace's
// test runner. It is written and type-checked here, never invoked live, exactly as
// `golden.test.ts`'s own header comment describes for T042/T047 -- the same env-guarded
// not-yet-deployed situation, not a new exception.
import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";

export const GOLDEN_QUERY_PASS_RATE_NAMESPACE = "RoofingCrm";
export const GOLDEN_QUERY_PASS_RATE_METRIC_NAME = "GoldenQueryPassRate";

export interface GoldenQueryPassRateInput {
  /** How many of the `repeats * queries.length` individual golden-query assertions in this run
   *  passed, out of the total attempted -- not "all queries in one run pass/fail together" (a
   *  single repeat hitting a transient timeout on one query should move the rate, not zero it). */
  readonly passedCount: number;
  readonly totalCount: number;
  /** Defaults to the real CloudWatch client; overridable in a unit test so no AWS call is ever
   *  made outside this file's own (none-yet-written) unit test and a real CI/scheduled run. */
  readonly client?: Pick<CloudWatchClient, "send">;
  readonly region?: string;
}

/** `Verified/Total`, matching `AgentCitationGroundednessRate`'s own `Verified/Total` shape
 *  (packages/observability/src/index.ts's METRIC_NAMES comment) so both are read the same way on
 *  the dashboard: a percentage, 0-100, never a raw pass/fail count. */
export function goldenQueryPassRatePercent(passedCount: number, totalCount: number): number {
  if (totalCount <= 0) {
    throw new Error("publishGoldenQueryPassRate: totalCount must be > 0");
  }
  return (passedCount / totalCount) * 100;
}

export async function publishGoldenQueryPassRate(input: GoldenQueryPassRateInput): Promise<void> {
  const client =
    input.client ?? new CloudWatchClient(input.region === undefined ? {} : { region: input.region });
  const value = goldenQueryPassRatePercent(input.passedCount, input.totalCount);
  await client.send(
    new PutMetricDataCommand({
      Namespace: GOLDEN_QUERY_PASS_RATE_NAMESPACE,
      MetricData: [
        {
          MetricName: GOLDEN_QUERY_PASS_RATE_METRIC_NAME,
          Value: value,
          Unit: StandardUnit.Percent,
          Timestamp: new Date(),
        },
      ],
    }),
  );
}
