// T007: API Gateway HTTP API + one Lambda (tRPC AppRouter, health router only this story),
// Powertools wired via the Lambda's own code (apps/api/src/handlers/health.ts), Cognito JWT
// authorizer attached to every route except health.ping (contracts/health.md). Declares an
// explicit CDK dependency on CrmOps (plan.md "Data Flow & Integration Points": the authorizer
// needs CrmOps's user pool/app client to exist first — the one recorded deviation from
// architecture-constitution.md §11's literal stack order, justified in plan.md's Complexity
// Tracking table).
import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { taskADenyStatement } from "./task-a-deny.js";

export interface CrmApiStackProps extends StackProps {
  /** Path to apps/api/src/handlers/health.ts, relative to this file. */
  readonly healthHandlerEntry: string;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  /** CrmOps's LockoutCounter table — auth.reportFailedAttempt writes to it (found deploying). */
  readonly lockoutTable: dynamodb.Table;
  /** CrmData's index bucket name (B-03: search.properties/search.permits/property.get read
   *  crm_property/crm_permit Parquet from here via the B-02 LeadIndex adapter) — same
   *  string-only pattern as crm-sync-stack.ts's indexBucketName (imported via fromBucketName,
   *  not passed as a construct, so this stack's own tests don't need a real CrmDataStack). */
  readonly indexBucketName: string;
  /** B-07's leads table name, for the META#index pointer read (ADR-05) — same string-only
   *  pattern as crm-sync-stack.ts's leadsTableName (no real table construct exists yet). */
  readonly leadsTableName: string;
  /** B-09 T017: the `crm-agent-usage` rate-limit/spend-cap table name (data-model.md), same
   *  string-only pattern as leadsTableName above. */
  readonly agentUsageTableName: string;
}

export class CrmApiStack extends Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: CrmApiStackProps) {
    super(scope, id, props);

    // @duckdb/node-api's native binding (B-03: search.properties/search.permits/property.get,
    // via apps/api/src/leadIndex.ts's DuckDbParquetLeadIndex) can't be statically bundled by
    // esbuild (found integrating B-03: "Could not resolve @duckdb/node-bindings-*/duckdb.node" —
    // the same class of error crm-sync-stack.ts's BuildIndex/Validate functions already hit and
    // fixed). Same remedy here: exclude it from the bundle and let CDK npm-install it alongside,
    // inside a Docker build on the target architecture so the installed native binding matches
    // the Lambda runtime, not this build host.
    const DUCKDB_NODE_MODULES = ["@duckdb/node-api"];
    const indexBucket = s3.Bucket.fromBucketName(this, "IndexBucket", props.indexBucketName);

    const trpcHandler = new NodejsFunction(this, "TrpcHandler", {
      functionName: "crm-api-trpc",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: props.healthHandlerEntry,
      // Found live (same fix as crm-sync-stack.ts's BuildIndex/Validate): this workspace's
      // pnpm-lock.yaml is lockfileVersion-incompatible with the CDK build image's bundled pnpm,
      // which then tries to re-resolve from the registry and hits a known old-pnpm/fetch bug
      // (ERR_INVALID_THIS) — unrelated to architecture. A plain npm lockfile naming only the one
      // native dependency sidesteps pnpm entirely for this function's nodeModules install.
      depsLockFilePath: new URL("../duckdb-lambda-deps/package-lock.json", import.meta.url)
        .pathname,
      // depsLockFilePath's directory becomes the bundling project root by default — repoint it
      // at the real monorepo root so esbuild can still resolve `entry` relative to it.
      projectRoot: new URL("../../", import.meta.url).pathname,
      handler: "handler",
      // 1024 MB reduces cold-init without a standing provisioned-concurrency cost
      // (plan.md "Cold-start risk decision" — measure via TZ03's X-Ray trace, then decide).
      memorySize: 1024,
      timeout: Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        POWERTOOLS_SERVICE_NAME: "crm-api",
        POWERTOOLS_METRICS_NAMESPACE: "RoofingCrm",
        LOCKOUT_TABLE_NAME: props.lockoutTable.tableName,
        // B-03: apps/api/src/leadIndex.ts reads these (never a hard-coded bucket/table name,
        // architecture-constitution.md §9's module-boundary table).
        CRM_INDEX_BUCKET_NAME: props.indexBucketName,
        CRM_LEADS_TABLE_NAME: props.leadsTableName,
        // B-09: apps/api/src/agent/{rateLimiter,spendCap}.ts read this (never a hard-coded table
        // name, architecture-constitution.md §9's module-boundary table).
        CRM_AGENT_USAGE_TABLE_NAME: props.agentUsageTableName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        // esbuild's ESM output can't convert a dependency's CJS `require()` calls on its own
        // ("Dynamic require of ... is not supported" at cold start, found deploying) — the
        // documented CDK workaround: a createRequire shim in the bundle banner.
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        // NodejsFunction defaults to externalModules: ['@aws-sdk/*'] (assumes the Lambda
        // runtime's built-in SDK), but its @smithy/* sub-dependencies aren't resolvable from
        // that built-in layer in ESM output (Runtime.ImportModuleError, found deploying) —
        // bundle the AWS SDK ourselves instead of depending on the runtime's version/layout.
        // @duckdb/node-api is the one exception (see DUCKDB_NODE_MODULES above).
        externalModules: DUCKDB_NODE_MODULES,
        nodeModules: DUCKDB_NODE_MODULES,
        forceDockerBundling: true,
      },
    });
    trpcHandler.role?.addToPrincipalPolicy(taskADenyStatement(this));
    props.lockoutTable.grantReadWriteData(trpcHandler);
    indexBucket.grantRead(trpcHandler);
    // B-07: leads read/write. TransactWriteItems is authorised per underlying action
    // (PutItem/UpdateItem/ConditionCheckItem); Query on GSI1/GSI2 needs the index ARNs, which
    // `grantIndexPermissions` adds. No Scan, no DeleteItem, no table-level admin actions.
    const leadsTable = dynamodb.Table.fromTableAttributes(this, "LeadsTable", {
      tableName: props.leadsTableName,
      grantIndexPermissions: true,
    });
    leadsTable.grantReadData(trpcHandler);
    leadsTable.grant(
      trpcHandler,
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:ConditionCheckItem",
    );

    // B-09 T017: `crm-agent-usage` rate-limit/spend-cap guard — rateLimiter.ts/spendCap.ts only
    // ever send one conditional UpdateItem per check (no reads, no transactions), so this grant
    // is UpdateItem-only, no Query/Scan/Delete (same minimal-actions pattern as leadsTable above).
    const agentUsageTable = dynamodb.Table.fromTableName(
      this,
      "AgentUsageTable",
      props.agentUsageTableName,
    );
    agentUsageTable.grant(trpcHandler, "dynamodb:UpdateItem");

    const authorizer = new authorizers.HttpUserPoolAuthorizer("CognitoAuthorizer", props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    // Same-origin only via the Amplify /api/* rewrite (ARD-B §2.2/§8); corsPreflight is
    // deliberately omitted (no CORS surface), not set to undefined.
    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "crm-api",
    });

    // AwsSolutions-APIG1: access logging on the default stage, via the L1 escape hatch (the L2
    // HttpStage in this CDK version has no typed accessLogSettings prop).
    const accessLogGroup = new logs.LogGroup(this, "AccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });
    const cfnStage = this.httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (cfnStage !== undefined) {
      cfnStage.accessLogSettings = {
        destinationArn: accessLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: "$context.requestId",
          ip: "$context.identity.sourceIp",
          requestTime: "$context.requestTime",
          httpMethod: "$context.httpMethod",
          routeKey: "$context.routeKey",
          status: "$context.status",
          protocol: "$context.protocol",
          responseLength: "$context.responseLength",
        }),
      };
    }
    accessLogGroup.grantWrite(new iam.ServicePrincipal("apigateway.amazonaws.com"));

    // auth.reportFailedAttempt is public and unauthenticated by necessity (routers/auth.ts), so
    // nothing stops a direct caller from invoking it without ever attempting a real sign-in —
    // confirmed exploitable as a credential-free DoS against the one seeded admin account (code
    // review, CR-B-01, Critical; decided with the user: rate-limit and accept the residual risk
    // for this one-shared-login demo account, not a full Custom Auth Challenge rearchitecture).
    // A tight route-level throttle (shared across all callers, not per-caller — HTTP API has no
    // per-IP throttling) raises the bar against casual/scripted abuse without blocking the
    // legitimate client's own occasional real report.
    if (cfnStage !== undefined) {
      cfnStage.routeSettings = {
        ...(cfnStage.routeSettings as Record<string, unknown> | undefined),
        "POST /trpc/auth.reportFailedAttempt": {
          // PascalCase, not CDK's usual camelCase: this L1 property is a raw passthrough map,
          // not a typed interface CDK converts for us (found deploying: camelCase keys were
          // silently rejected by the API Gateway resource handler with "Unrecognized field").
          // Burst must cover the full Playwright suite's legitimate use of this route, not just
          // one AC-3 run: the suite runs AC-3's 4-wrong-attempt flow once per viewport project
          // (3x) within a few minutes — found deploying: burst 2, then burst 5, each 429'd a
          // later project's run once the earlier ones had spent it faster than the steady-state
          // rate refilled.
          ThrottlingBurstLimit: 15,
          ThrottlingRateLimit: 0.2, // steady-state: 1 request per 5s once the burst is spent
        },
      };
    }

    const integration = new integrations.HttpLambdaIntegration("TrpcIntegration", trpcHandler);

    // health.ping: the one route with no authorizer (contracts/health.md).
    this.httpApi.addRoutes({
      path: "/trpc/health.ping",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration,
    });

    // auth.reportFailedAttempt: also unauthenticated — called from the sign-in page before any
    // session exists (found deploying; see routers/auth.ts). A tRPC mutation, POST only.
    this.httpApi.addRoutes({
      path: "/trpc/auth.reportFailedAttempt",
      methods: [apigwv2.HttpMethod.POST],
      integration,
    });

    // Every other tRPC route sits behind the Cognito JWT authorizer (constitution P0-11).
    this.httpApi.addRoutes({
      path: "/trpc/{proxy+}",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration,
      authorizer,
    });

    this.apiUrl = this.httpApi.apiEndpoint;

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole is the standard CloudWatch Logs write policy every Lambda needs for Powertools Logger/Tracer (constitution Article VIII); a hand-written equivalent would grant the same three log actions with no added protection (demo project, Article III cost-consciousness).",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "The wildcard is CDK's own auto-generated log-group-scoped policy (NodejsFunction/LogRetention), not an app-authored grant; it is scoped to this function's own log group by the construct, not to all resources.",
          appliesTo: ["Resource::*"],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "B-03: the wildcards are CDK's own auto-generated, resource-scoped grant from Bucket.grantRead (s3:GetObject*, s3:GetBucket*, s3:List* scoped to this stack's own imported index bucket) — the same pattern already accepted in crm-sync-stack.ts for the same bucket.",
          appliesTo: [
            { regex: "/^Action::s3:(GetObject|GetBucket|List)\\*$/" },
            { regex: "/^Resource::arn:aws:s3:::<IndexBucket[A-Za-z0-9]+>\\/\\*$/" },
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "B-07: Query on crm-leads' GSI1 (assignee) and GSI2 (status) is authorised only on the index ARN, so the grant is table/crm-leads/index/*, scoped to this one table's own indexes. The actions are read plus PutItem/UpdateItem/ConditionCheckItem; no Scan, no DeleteItem (see the grant comment above).",
          appliesTo: [
            {
              regex:
                "/^Resource::arn:aws:dynamodb:eu-north-1:(<AWS::AccountId>|[0-9]{12}):table\\/crm-leads\\/index\\/\\*$/",
            },
          ],
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.httpApi.node.path}/GET--trpc--health.ping/Resource`,
      [
        {
          id: "AwsSolutions-APIG4",
          reason:
            "health.ping is deliberately the one unauthenticated route in this story (contracts/health.md, constitution P0-11's named exception) — it exists specifically so AC-2/NFR-001's X-Ray trace check has nothing in front of it to confound timing.",
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.httpApi.node.path}/POST--trpc--health.ping/Resource`,
      [
        {
          id: "AwsSolutions-APIG4",
          reason:
            "health.ping is deliberately the one unauthenticated route in this story (contracts/health.md, constitution P0-11's named exception).",
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.httpApi.node.path}/POST--trpc--auth.reportFailedAttempt/Resource`,
      [
        {
          id: "AwsSolutions-APIG4",
          reason:
            "auth.reportFailedAttempt is deliberately unauthenticated — called from the sign-in page before any session exists (found deploying; decided with the user: client-reported failure count, server-enforced block — see auth/lockout-handler.ts).",
        },
      ],
    );
  }
}
