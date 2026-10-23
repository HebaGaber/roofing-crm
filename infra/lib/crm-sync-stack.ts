// T038: the crm-sync Step Functions state machine (Plan → FetchPart(Map) → BuildIndex → Validate
// → Promote, architecture-constitution.md §2.3) and its five Lambda handlers. No longer
// "intentionally empty" (B-01 T005) — infra/test/crm-sync-stack.test.ts and
// infra/test/iam-deny.test.ts (T009, T037).
//
// This is the one hard INDEX/SYNC convergence point (tasks.md's Dependencies section): it wires
// Plan/BuildIndex/Validate/Promote (espeon's handlers, built concurrently in this same build
// wave) by file path, alongside FetchPart and the DLQ/alarm this file also owns (machamp). If
// espeon's handler files don't exist yet when this stack is synthesized, `NodejsFunction`'s
// esbuild bundling throws — that is expected mid-build-wave (Phase 5's integration check runs
// after both groups finish), not a defect in this file.
import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { taskADenyStatement } from "./task-a-deny.js";

export interface CrmSyncStackProps extends StackProps {
  /** Path to apps/sync/handlers/plan.ts (espeon, T024). */
  readonly planHandlerEntry: string;
  /** Path to apps/sync/handlers/fetchPart.ts (machamp, T030). */
  readonly fetchPartHandlerEntry: string;
  /** Path to apps/sync/handlers/buildIndex.ts (espeon, T015/T017). */
  readonly buildIndexHandlerEntry: string;
  /** Path to apps/sync/handlers/validate.ts (espeon, T019/T020a). */
  readonly validateHandlerEntry: string;
  /** Path to apps/sync/handlers/promote.ts (espeon, T022). */
  readonly promoteHandlerEntry: string;
  /** The private S3 bucket this story's CrmData stack creates (crm-data-stack.ts) — imported by
   * name, not a typed cross-stack bucket reference, so this stack (and its tests) can exercise
   * it without needing CrmData's construct tree, matching the pre-written
   * infra/test/crm-sync-stack.test.ts fixture shape. */
  readonly indexBucketName: string;
  /** The existing `crm-leads` DynamoDB table (B-07 creates it) — reused for the `META#index`
   * pointer item (architecture-constitution.md §9: "no new table"). Imported by name; this stack
   * never creates a DynamoDB table. */
  readonly leadsTableName: string;
  /** Config value (ARD-B §13's accepted SNS-instead-of-PagerDuty deviation): an optional email
   * subscriber for the FetchPart DLQ alarm. No subscription is created when omitted. */
  readonly alarmEmail?: string;
}

const HANDLER_MEMORY_MB = 1024;
const HANDLER_TIMEOUT = Duration.minutes(5);
/** NFR-002 / ADR-02: FetchPart's Map runs with bounded concurrency 2–3. */
const FETCH_PART_MAP_CONCURRENCY = 3;

/**
 * FetchPart's DLQ and its one self-resolving CloudWatch alarm (constitution Article VII; tasks.md
 * T033/T034). Exported standalone — built directly on `scope`, with no dependency on any pipeline
 * Lambda — so T033's test (`apps/sync/test/dlq.test.ts`) can exercise this wiring with no
 * dependency on every pipeline handler's entry file existing (this story's one hard convergence
 * point is the state machine definition below, not this DLQ/alarm pair).
 */
export function addFetchPartDlqAndAlarm(
  scope: Construct,
  props: { readonly alarmTopic?: sns.ITopic | undefined } = {},
): { readonly queue: sqs.Queue; readonly alarm: cloudwatch.Alarm } {
  const queue = new sqs.Queue(scope, "FetchPartDlq", {
    queueName: "crm-sync-fetch-part-dlq",
    retentionPeriod: Duration.days(14),
    enforceSSL: true,
  });
  NagSuppressions.addResourceSuppressions(queue, [
    {
      id: "AwsSolutions-SQS3",
      reason:
        "This queue is itself FetchPart's terminal DLQ (constitution Article VII) — it is the sink a failed message lands on after exhausting retries, so it has no DLQ of its own by design; a part that fails here is held for operator review (architecture-constitution.md §8), never silently dropped.",
    },
  ]);

  const alarm = new cloudwatch.Alarm(scope, "FetchPartDlqAlarm", {
    alarmName: "crm-sync-fetch-part-dlq-depth",
    alarmDescription:
      "FetchPart DLQ depth > 0 (architecture-constitution.md §8). CloudWatch alarms are state-" +
      "based, so this fires once per transition into ALARM (never once per message) and returns " +
      "to OK on its own as soon as the queue's own ApproximateNumberOfMessagesVisible metric " +
      "reports 0 again — no extra treat-missing-data handling needed; SQS always publishes that " +
      "metric, including the zero value, once the queue is drained.",
    metric: queue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
    threshold: 0,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });

  if (props.alarmTopic !== undefined) {
    alarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
    alarm.addOkAction(new cloudwatchActions.SnsAction(props.alarmTopic));
  }

  return { queue, alarm };
}

export class CrmSyncStack extends Stack {
  public readonly stateMachine: sfn.StateMachine;
  public readonly fetchPartDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: CrmSyncStackProps) {
    super(scope, id, props);

    const indexBucket = s3.Bucket.fromBucketName(this, "IndexBucket", props.indexBucketName);
    const leadsTable = dynamodb.Table.fromTableName(this, "LeadsTable", props.leadsTableName);

    const alarmTopic =
      props.alarmEmail === undefined ? undefined : new sns.Topic(this, "SyncAlarmsTopic");
    if (alarmTopic !== undefined && props.alarmEmail !== undefined) {
      alarmTopic.addSubscription(new snsSubscriptions.EmailSubscription(props.alarmEmail));
    }

    const makeHandler = (
      id: string,
      functionName: string,
      entry: string,
      environment: Record<string, string>,
      handlerExportName: string,
      nodeModules: string[] = [],
      architecture: lambda.Architecture = lambda.Architecture.X86_64,
      depsLockFilePath?: string,
    ): NodejsFunction => {
      // An explicit LogGroup (rather than NodejsFunction's `logRetention` prop) avoids spinning
      // up CDK's LogRetention custom-resource Lambda per function — keeping this stack's Lambda
      // count exactly the five pipeline handlers (infra/test/crm-sync-stack.test.ts's literal
      // `resourceCountIs("AWS::Lambda::Function", 5)` assertion).
      const logGroup = new logs.LogGroup(this, `${id}Logs`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const fn = new NodejsFunction(this, id, {
        functionName,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture,
        entry,
        ...(depsLockFilePath === undefined
          ? {}
          : {
              depsLockFilePath,
              // depsLockFilePath's directory becomes the bundling project root by default —
              // repoint it at the real monorepo root so esbuild can still resolve `entry`
              // (apps/sync/handlers/...) relative to it.
              projectRoot: new URL("../../", import.meta.url).pathname,
            }),
        handler: handlerExportName,
        memorySize: HANDLER_MEMORY_MB,
        timeout: HANDLER_TIMEOUT,
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          POWERTOOLS_SERVICE_NAME: functionName,
          POWERTOOLS_METRICS_NAMESPACE: "RoofingCrm",
          ...environment,
        },
        logGroup,
        bundling: {
          format: OutputFormat.ESM,
          minify: true,
          // Same esbuild/ESM CJS-interop fix as every other NodejsFunction in this repo
          // (crm-api-stack.ts, crm-ops-stack.ts) — a dependency's CJS `require()` call doesn't
          // convert on its own in ESM output.
          banner:
            "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
          // @duckdb/node-api ships a platform-specific native .node binding that esbuild cannot
          // resolve statically (it's a dynamic `require()` switched on process.platform/arch) —
          // excluding it from the bundle and letting CDK npm-install it alongside instead is the
          // standard NodejsFunction pattern for native-addon dependencies.
          externalModules: nodeModules,
          nodeModules,
          // Found live (Runtime.ImportModuleError): nodeModules' install step runs on the build
          // host by default, so a local pnpm install on this arm64 Mac resolves the darwin-arm64
          // native binding, not the linux x86_64 one the Lambda runtime needs. Forcing Docker
          // bundling runs that install inside the same Amazon Linux image the function deploys
          // to, so the installed @duckdb/node-bindings variant always matches the runtime.
          forceDockerBundling: nodeModules.length > 0,
        },
      });
      fn.role?.addToPrincipalPolicy(taskADenyStatement(this));
      return fn;
    };

    const planFn = makeHandler(
      "PlanFunction",
      "crm-sync-plan",
      props.planHandlerEntry,
      { CRM_INDEX_BUCKET_NAME: props.indexBucketName },
      "planHandler",
    );
    const fetchPartFn = makeHandler(
      "FetchPartFunction",
      "crm-sync-fetch-part",
      props.fetchPartHandlerEntry,
      {
        CRM_INDEX_BUCKET_NAME: props.indexBucketName,
        // Found live: these were never wired, so productionFetchers() always returned an empty
        // list and every part went straight to the DLQ. Filebase + Pinata only, matching Plan's
        // own hardcoded manifest-fetch gateway list (research.md) — CloudFront's distribution
        // serves at `/{cid}`, not the `/ipfs/{cid}` path every gateway fetcher here uses, so it
        // isn't wired through this shared template (ADR-02's fallback order still holds; this is
        // the same choice Plan already made, not a new deviation).
        GATEWAY_FILEBASE_BASE_URL: "https://ipfs.filebase.io",
        GATEWAY_PINATA_BASE_URL: "https://gateway.pinata.cloud",
      },
      "handler",
    );
    const buildIndexFn = makeHandler(
      "BuildIndexFunction",
      "crm-sync-build-index",
      props.buildIndexHandlerEntry,
      { CRM_INDEX_BUCKET_NAME: props.indexBucketName },
      "buildIndexHandler",
      ["@duckdb/node-api"],
      // ARM64, not the X86_64 default: Docker bundling on this Apple Silicon host runs native
      // arm64 containers with no emulation, so the native DuckDB binding it installs is
      // linux-arm64 — matching this architecture, not X86_64 (ARM64 Lambda is also the AWS-
      // recommended, cheaper default; nothing else in this stack requires X86_64).
      lambda.Architecture.ARM_64,
      // Found live: this workspace's pnpm-lock.yaml is lockfileVersion-incompatible with the
      // CDK build image's bundled pnpm, which then tries to re-resolve from the registry and
      // hits a known old-pnpm/fetch bug (ERR_INVALID_THIS) — unrelated to architecture. A plain
      // npm lockfile naming only this one native dependency sidesteps pnpm entirely for this
      // one function's nodeModules install.
      new URL("../duckdb-lambda-deps/package-lock.json", import.meta.url).pathname,
    );
    const validateFn = makeHandler(
      "ValidateFunction",
      "crm-sync-validate",
      props.validateHandlerEntry,
      {
        CRM_INDEX_BUCKET_NAME: props.indexBucketName,
        CRM_LEADS_TABLE_NAME: props.leadsTableName,
      },
      "validateHandler",
      // Validate also reads Parquet via apps/sync/src/engine/duckdb.ts now (it proves row
      // counts/provenance against BuildIndex's own output) — same native-binding treatment as
      // BuildIndexFunction (ARM64 + the npm-only lockfile for the Docker-bundled pnpm bug).
      ["@duckdb/node-api"],
      lambda.Architecture.ARM_64,
      new URL("../duckdb-lambda-deps/package-lock.json", import.meta.url).pathname,
    );
    const promoteFn = makeHandler(
      "PromoteFunction",
      "crm-sync-promote",
      props.promoteHandlerEntry,
      { CRM_LEADS_TABLE_NAME: props.leadsTableName },
      "promoteHandler",
    );

    indexBucket.grantWrite(planFn);
    indexBucket.grantReadWrite(fetchPartFn);
    indexBucket.grantReadWrite(buildIndexFn);
    indexBucket.grantRead(validateFn);
    leadsTable.grantReadData(validateFn);
    leadsTable.grantReadWriteData(promoteFn);

    const { queue: fetchPartDlq } = addFetchPartDlqAndAlarm(this, { alarmTopic });
    this.fetchPartDlq = fetchPartDlq;
    fetchPartDlq.grantSendMessages(fetchPartFn);

    // --- Step Functions definition (architecture-constitution.md §2.3) ---
    //
    // The Map iterates Plan's `parts` (the manifest's own table artifacts, not `profiles` — a
    // profile is a vendored code reference checked by the digest guard, never a fetch target).
    // Each item is one PlanPart ({path}); itemSelector pairs it with the run's manifestCid so
    // FetchPart receives the {manifestCid, part} shape its contract requires.

    const planTask = new tasks.LambdaInvoke(this, "Plan", {
      lambdaFunction: planFn,
      outputPath: "$.Payload",
    });

    const heldNoPromotion = new sfn.Pass(this, "HeldNoPromotion", {
      comment:
        "Plan or Validate held this run (digest mismatch, lineage fork, cost gate, unexplained " +
        "reconcile diff, or an unverified part) — the current promoted index keeps serving " +
        "(constitution P0-3: no partial promotion).",
    });

    const fetchPartInvoke = new tasks.LambdaInvoke(this, "FetchPartInvoke", {
      lambdaFunction: fetchPartFn,
      outputPath: "$.Payload",
    });

    const sendToFetchPartDlq = new tasks.SqsSendMessage(this, "SendToFetchPartDlq", {
      queue: fetchPartDlq,
      messageBody: sfn.TaskInput.fromJsonPathAt("$"),
      // Discarding the SQS response keeps this Map item's own output as FetchPart's original
      // {status: "dlq", ...} result rather than replacing it with SQS's send-message metadata —
      // Validate (via BuildIndex's pass-through) needs to see which items were DLQ'd.
      resultPath: sfn.JsonPath.DISCARD,
    });

    const partVerified = new sfn.Pass(this, "PartVerified");

    const fetchPartResultChoice = new sfn.Choice(this, "FetchPartResultChoice")
      .when(sfn.Condition.stringEquals("$.status", "dlq"), sendToFetchPartDlq)
      .otherwise(partVerified);

    const fetchPartsMap = new sfn.Map(this, "FetchPartsMap", {
      // ADR-02 / NFR-002: bounded concurrency 2–3 parallel fetches.
      maxConcurrency: FETCH_PART_MAP_CONCURRENCY,
      itemsPath: sfn.JsonPath.stringAt("$.parts"),
      itemSelector: {
        "manifestCid.$": "$.manifestCid",
        "part.$": "$$.Map.Item.Value",
      },
      // Kept (not discarded): BuildIndex echoes this array's statuses forward as
      // `anyPartUnverified` for Validate (T020a) — a run is never promoted with one DLQ'd part.
      resultPath: "$.fetchResults",
    });
    fetchPartsMap.itemProcessor(fetchPartInvoke.next(fetchPartResultChoice));

    const buildIndexTask = new tasks.LambdaInvoke(this, "BuildIndex", {
      lambdaFunction: buildIndexFn,
      outputPath: "$.Payload",
    });

    const validateTask = new tasks.LambdaInvoke(this, "Validate", {
      lambdaFunction: validateFn,
      outputPath: "$.Payload",
    });

    const promoteTask = new tasks.LambdaInvoke(this, "Promote", {
      lambdaFunction: promoteFn,
      outputPath: "$.Payload",
    });

    const validateResultChoice = new sfn.Choice(this, "ValidateResultChoice")
      .when(sfn.Condition.stringEquals("$.status", "Validated"), promoteTask)
      .otherwise(heldNoPromotion);

    const planResultChoice = new sfn.Choice(this, "PlanResultChoice")
      // Plan's success shape (contracts/sync-pipeline.md's PlanResult) never sets `status` at all
      // — Condition.stringEquals on a path that's genuinely absent throws rather than evaluating
      // to false, so `isPresent` must gate it first.
      .when(
        sfn.Condition.and(
          sfn.Condition.isPresent("$.status"),
          sfn.Condition.stringEquals("$.status", "Held"),
        ),
        heldNoPromotion,
      )
      .otherwise(fetchPartsMap.next(buildIndexTask).next(validateTask).next(validateResultChoice));

    const definition = planTask.next(planResultChoice);

    const stateMachineLogGroup = new logs.LogGroup(this, "StateMachineLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    this.stateMachine = new sfn.StateMachine(this, "CrmSyncStateMachine", {
      stateMachineName: "crm-sync",
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      // NFR-001: ≤30 min for the full county; generous headroom over the sample's ≤5 min.
      timeout: Duration.minutes(35),
      tracingEnabled: true,
      logs: { destination: stateMachineLogGroup, level: sfn.LogLevel.ALL },
    });
    // Defense in depth (constitution P0-1): every role this stack creates carries the Deny,
    // including the state machine's own orchestration role, even though it only ever invokes
    // this stack's own Lambdas and its own DLQ (infra/test/iam-deny.test.ts, T037).
    this.stateMachine.role.addToPrincipalPolicy(taskADenyStatement(this));

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole is the standard CloudWatch Logs write policy every Lambda needs for Powertools Logger/Tracer (constitution Article VIII); a hand-written equivalent would grant the same actions (demo project, Article III cost-consciousness).",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "The wildcards are CDK's own auto-generated, resource-scoped grants: Bucket.grantRead/grantReadWrite's action-group wildcards (s3:GetObject*, s3:List*, s3:GetBucket*, s3:DeleteObject*, s3:Abort*) scoped to this stack's own imported index bucket; the state machine role's Lambda-invoke grants, which CDK always suffixes with ':*' to cover every published version/alias of a function this stack itself creates; and every Lambda's X-Ray tracing permissions (xray:PutTraceSegments/PutTelemetryRecords, constitution Article VIII), which AWS does not support scoping to a resource ARN at all — not an app-authored blanket grant.",
          appliesTo: [
            { regex: "/^Action::s3:(GetObject|List|GetBucket|DeleteObject|Abort)\\*$/" },
            { regex: "/^Resource::arn:aws:s3:::<IndexBucket[A-Za-z0-9]+>\\/\\*$/" },
            {
              regex:
                "/^Resource::<(BuildIndexFunction|FetchPartFunction|PlanFunction|PromoteFunction|ValidateFunction)[A-Za-z0-9]+\\.Arn>:\\*$/",
            },
            "Resource::*",
          ],
        },
      ],
      true,
    );
  }
}
