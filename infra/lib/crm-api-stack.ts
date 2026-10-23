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
}

export class CrmApiStack extends Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: CrmApiStackProps) {
    super(scope, id, props);

    const trpcHandler = new NodejsFunction(this, "TrpcHandler", {
      functionName: "crm-api-trpc",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: props.healthHandlerEntry,
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
        externalModules: [],
      },
    });
    trpcHandler.role?.addToPrincipalPolicy(taskADenyStatement(this));
    props.lockoutTable.grantReadWriteData(trpcHandler);

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
