// T017: Cognito UserPool (no self sign-up), one UserPoolClient (SRP, no secret), the
// LockoutCounter DynamoDB table (data-model.md), the pre-auth lockout Lambda trigger (T018), and
// a CDK custom resource seeding one admin test user with its password written only to Secrets
// Manager (Round 1 decision D-1; constitution Article XII — never in git, logs or the PR body).
import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { taskADenyStatement } from "./task-a-deny.js";

export interface CrmOpsStackProps extends StackProps {
  /** Path to apps/api/src/auth/lockout-handler.ts, relative to this file. */
  readonly lockoutHandlerEntry: string;
}

export class CrmOpsStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly adminSecret: secretsmanager.Secret;
  public readonly lockoutTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: CrmOpsStackProps) {
    super(scope, id, props);

    const lockoutTable = new dynamodb.Table(this, "LockoutCounterTable", {
      tableName: "crm-lockout-counter",
      partitionKey: { name: "username", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY, // Demo project (Article III addendum); no durable business data.
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    const lockoutHandler = new NodejsFunction(this, "LockoutHandler", {
      functionName: "crm-ops-lockout",
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: props.lockoutHandlerEntry,
      handler: "handler",
      memorySize: 1024,
      timeout: Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        LOCKOUT_TABLE_NAME: lockoutTable.tableName,
        POWERTOOLS_SERVICE_NAME: "crm-ops-lockout",
        POWERTOOLS_METRICS_NAMESPACE: "RoofingCrm",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        // Same fix as CrmApi's TrpcHandler (crm-api-stack.ts) — esbuild's ESM output can't
        // convert a dependency's CJS `require()` calls on its own; shim it in the bundle banner.
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        // Same reason as CrmApi: don't rely on the Lambda runtime's built-in AWS SDK layout.
        externalModules: [],
      },
    });
    lockoutTable.grantReadWriteData(lockoutHandler);
    lockoutHandler.role?.addToPrincipalPolicy(taskADenyStatement(this));
    this.lockoutTable = lockoutTable;

    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "roofing-crm-users",
      selfSignUpEnabled: false, // No sign-up UI route (AC-1); the one seeded admin user only.
      // email as the actual Cognito username (UsernameAttributes), not an alias of a separate
      // generated username — AdminCreateUser's Username is the email address (AC-1), which
      // Cognito rejects if `username: true` is also set (that configures AliasAttributes
      // instead and email-shaped usernames are then refused at create time).
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.NONE, // No self-service path at all (AC-1).
      removalPolicy: RemovalPolicy.DESTROY,
      lambdaTriggers: {
        preAuthentication: lockoutHandler,
        // Cognito-native, unspoofable reset of the counter on an actual success (found
        // deploying — see lockout-handler.ts's module header for the full picture).
        postAuthentication: lockoutHandler,
      },
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: "roofing-crm-web",
      generateSecret: false, // SRP from the browser (research.md); no client secret.
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
    });

    // Round 1 decision D-1: the seeded admin password lives only in Secrets Manager.
    this.adminSecret = new secretsmanager.Secret(this, "AdminUserSecret", {
      secretName: "roofing-crm/admin-user",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin@roofing-crm.test" }),
        generateStringKey: "password",
        excludePunctuation: false,
        passwordLength: 20,
      },
    });

    const seedAdminUser = new cr.AwsCustomResource(this, "SeedAdminUser", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminCreateUser",
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: "admin@roofing-crm.test",
          UserAttributes: [
            { Name: "email", Value: "admin@roofing-crm.test" },
            { Name: "email_verified", Value: "true" },
          ],
          MessageAction: "SUPPRESS",
        },
        physicalResourceId: cr.PhysicalResourceId.of("roofing-crm-admin-user"),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.userPool.userPoolArn],
      }),
    });

    const setAdminPassword = new cr.AwsCustomResource(this, "SetAdminPassword", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminSetUserPassword",
        parameters: {
          UserPoolId: this.userPool.userPoolId,
          Username: "admin@roofing-crm.test",
          Password: this.adminSecret.secretValueFromJson("password").unsafeUnwrap(),
          Permanent: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of("roofing-crm-admin-password"),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.userPool.userPoolArn],
      }),
    });
    setAdminPassword.node.addDependency(seedAdminUser);
    this.adminSecret.grantRead(setAdminPassword);

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole is the standard CloudWatch Logs write policy every Lambda needs for Powertools Logger/Tracer (constitution Article VIII); also used by CDK's own AwsCustomResource/LogRetention providers. A hand-written equivalent would grant the same actions (demo project, Article III cost-consciousness).",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "The wildcard is CDK's own auto-generated log-group-scoped policy (NodejsFunction/LogRetention/AwsCustomResource), not an app-authored grant.",
          appliesTo: ["Resource::*"],
        },
        {
          id: "AwsSolutions-SMG4",
          reason:
            "This secret holds the one shared, seeded admin test-user password for a time-boxed assessment demo, set once by the CDK custom resource at deploy time (Round 1 decision D-1); automatic rotation would invalidate the credential the Demo Transcript hands the evaluator mid-assessment.",
        },
        {
          id: "AwsSolutions-COG3",
          reason:
            "Cognito advanced security (Plus feature tier) bills per MAU with no budget for it in this $120-credit demo account (constitution Article III addendum); the story's exact 4th-attempt/5-minute lockout is already enforced deterministically by the custom pre-auth Lambda (research.md), which is the actual designed control, not Cognito's heuristic risk scoring.",
        },
        {
          id: "AwsSolutions-COG2",
          reason:
            "MFA would block the single shared test login the README's Demo Transcript and CLAUDE.md's hosted-runtime proof require the evaluator to use directly; this is a demo account with one seeded user, not a multi-tenant production pool.",
        },
        {
          id: "AwsSolutions-L1",
          reason:
            "AWS679f53fa... is CDK's own internal Provider Lambda for AwsCustomResource (cr.AwsCustomResource), not app code — its runtime version is chosen and updated by the CDK framework, not by this stack.",
        },
      ],
      true,
    );
  }
}
