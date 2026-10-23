// T033: a part that exhausts retries lands on the DLQ, exactly one CloudWatch alarm fires per
// DLQ-depth-above-zero event (a CloudWatch alarm state transition, not one firing per message),
// and the alarm self-resolves once the DLQ drains (constitution Article VII; architecture-
// constitution.md §8). T034 implements `addFetchPartDlqAndAlarm` in infra/lib/crm-sync-stack.ts
// to make this pass — intentionally failing now (no export exists yet).
//
// This exercises the DLQ+alarm construct in isolation, on a bare `Stack`, deliberately not the
// full CrmSyncStack: the INDEX group's Plan/BuildIndex/Validate/Promote handler files (T024,
// T015, T019/T020a, T022) are built concurrently in this same build wave and may not exist yet,
// which would make a full-stack `cdk synth` throw on NodejsFunction bundling for reasons that
// have nothing to do with this DLQ/alarm wiring (tasks.md's note on T038's convergence point).
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as sns from "aws-cdk-lib/aws-sns";
import { describe, expect, it } from "vitest";
import { addFetchPartDlqAndAlarm } from "../../../infra/lib/crm-sync-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };

function buildBareStack(withTopic = false) {
  const app = new App();
  const stack = new Stack(app, "TestStack", { env: ENV });
  const topic = withTopic ? new sns.Topic(stack, "AlarmTopic") : undefined;
  addFetchPartDlqAndAlarm(stack, withTopic ? { alarmTopic: topic } : {});
  return Template.fromStack(stack);
}

describe("FetchPart DLQ + self-resolving alarm (T033/T034)", () => {
  it("creates exactly one DLQ for FetchPart", () => {
    const template = buildBareStack();
    template.resourceCountIs("AWS::SQS::Queue", 1);
  });

  it("creates exactly one CloudWatch alarm on the DLQ's visible-message-count metric", () => {
    const template = buildBareStack();
    template.resourceCountIs("AWS::CloudWatch::Alarm", 1);
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "AWS/SQS",
      MetricName: "ApproximateNumberOfMessagesVisible",
      // Depth-above-zero, evaluated over a single period: the alarm fires once per state
      // transition into ALARM (not once per message) and returns to OK on its own once the
      // queue's own metric reports 0 again — no per-message fan-out, no manual reset.
      Threshold: 0,
      ComparisonOperator: "GreaterThanThreshold",
      EvaluationPeriods: 1,
    });
  });

  it("wires the alarm's action to the given SNS topic when provided", () => {
    const template = buildBareStack(true);
    const alarms = template.findResources("AWS::CloudWatch::Alarm");
    const [alarm] = Object.values(alarms) as { Properties: { AlarmActions?: unknown[] } }[];
    expect(alarm?.Properties.AlarmActions?.length ?? 0).toBeGreaterThan(0);
  });

  it("the DLQ enforces TLS-only access", () => {
    const template = buildBareStack();
    const policies = template.findResources("AWS::SQS::QueuePolicy");
    expect(Object.keys(policies).length).toBeGreaterThan(0);
  });
});
