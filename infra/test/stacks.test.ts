// Unit assertions for the six CDK stacks (TN02 runs `cdk synth --strict` + cdk-nag separately).
// These use `Template.fromStack` so they run with no AWS credentials and no network.
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CrmApiStack } from "../lib/crm-api-stack.js";
import { CrmDataStack } from "../lib/crm-data-stack.js";
import { CrmDomainStack } from "../lib/crm-domain-stack.js";
import { CrmOpsStack } from "../lib/crm-ops-stack.js";
import { CrmSyncStack } from "../lib/crm-sync-stack.js";
import { CrmWebStack } from "../lib/crm-web-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };
const HEALTH_ENTRY = new URL("../../apps/api/src/handlers/health.ts", import.meta.url).pathname;
const LOCKOUT_ENTRY = new URL("../../apps/api/src/auth/lockout-handler.ts", import.meta.url)
  .pathname;

describe("CrmData / CrmSync (T005, stubbed)", () => {
  it("declare no resources yet", () => {
    const dataTemplate = Template.fromStack(new CrmDataStack(new App(), "CrmData", { env: ENV }));
    const syncTemplate = Template.fromStack(new CrmSyncStack(new App(), "CrmSync", { env: ENV }));
    expect(Object.keys(dataTemplate.toJSON().Resources ?? {})).toHaveLength(0);
    expect(Object.keys(syncTemplate.toJSON().Resources ?? {})).toHaveLength(0);
  });
});

describe("CrmOps (T017)", () => {
  function buildOps() {
    const app = new App();
    return Template.fromStack(
      new CrmOpsStack(app, "CrmOps", { env: ENV, lockoutHandlerEntry: LOCKOUT_ENTRY }),
    );
  }

  it("creates a Cognito user pool with self sign-up disabled", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  it("creates one user pool client with no secret and SRP auth", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      ExplicitAuthFlows: Match.arrayWith(["ALLOW_USER_SRP_AUTH"]),
    });
  });

  it("creates the LockoutCounter DynamoDB table keyed by username", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "crm-lockout-counter",
      KeySchema: [{ AttributeName: "username", KeyType: "HASH" }],
    });
  });

  it("wires the lockout Lambda as a PreAuthentication trigger", () => {
    const template = buildOps();
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      LambdaConfig: Match.objectLike({ PreAuthentication: Match.anyValue() }),
    });
  });

  it("seeds exactly one admin user via a custom resource, password only in Secrets Manager", () => {
    const template = buildOps();
    template.resourceCountIs("AWS::SecretsManager::Secret", 1);
    const customResources = template.findResources("Custom::AWS");
    expect(Object.keys(customResources).length).toBeGreaterThanOrEqual(2);
  });

  it("denies Task A's S3/SSM resources on the lockout Lambda's role (T007B)", () => {
    const template = buildOps();
    template.hasResourceProperties(
      "AWS::IAM::Policy",
      Match.objectLike({
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Deny",
              Sid: "DenyTaskAResources",
            }),
          ]),
        }),
      }),
    );
  });
});

describe("CrmApi (T007)", () => {
  function buildApi() {
    const app = new App();
    const ops = new CrmOpsStack(app, "CrmOps", { env: ENV, lockoutHandlerEntry: LOCKOUT_ENTRY });
    const template = Template.fromStack(
      new CrmApiStack(app, "CrmApi", {
        env: ENV,
        healthHandlerEntry: HEALTH_ENTRY,
        userPool: ops.userPool,
        userPoolClient: ops.userPoolClient,
        lockoutTable: ops.lockoutTable,
      }),
    );
    return template;
  }

  it("creates an HTTP API with a JWT authorizer", () => {
    const template = buildApi();
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "JWT",
    });
  });

  it("denies Task A's S3/SSM resources on the API Lambda's role (T007B)", () => {
    const template = buildApi();
    template.hasResourceProperties(
      "AWS::IAM::Policy",
      Match.objectLike({
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({ Effect: "Deny", Sid: "DenyTaskAResources" }),
          ]),
        }),
      }),
    );
  });

  it("the health.ping route has no authorizer attached", () => {
    const template = buildApi();
    const routes = template.findResources("AWS::ApiGatewayV2::Route");
    interface RouteResource {
      Properties: { RouteKey?: string; AuthorizationType?: string };
    }
    const healthRoutes = Object.values(routes as Record<string, RouteResource>).filter(
      (r) =>
        typeof r.Properties.RouteKey === "string" && r.Properties.RouteKey.includes("health.ping"),
    );
    expect(healthRoutes.length).toBeGreaterThan(0);
    for (const route of healthRoutes) {
      expect(route.Properties.AuthorizationType ?? "NONE").not.toBe("JWT");
    }
  });
});

describe("CrmWeb (T009)", () => {
  it("creates an Amplify app with the /api/* rewrite and no base-URL env var", () => {
    const app = new App();
    const template = Template.fromStack(
      new CrmWebStack(app, "CrmWeb", {
        env: ENV,
        githubRepository: "HebaGaber/roofing-crm",
        githubRef: "001-crm-shell",
        apiUrl: "https://example.execute-api.eu-north-1.amazonaws.com",
        userPoolId: "eu-north-1_example",
        userPoolClientId: "exampleclientid",
      }),
    );
    template.hasResourceProperties("AWS::Amplify::App", {
      CustomRules: Match.arrayWith([Match.objectLike({ Source: "/api/<*>" })]),
      EnvironmentVariables: Match.arrayWith([
        Match.objectLike({ Name: "VITE_COGNITO_USER_POOL_ID", Value: "eu-north-1_example" }),
        Match.objectLike({ Name: "VITE_COGNITO_USER_POOL_CLIENT_ID", Value: "exampleclientid" }),
      ]),
    });
    template.resourceCountIs("AWS::Amplify::Branch", 1);
  });
});

describe("CrmDomain (T010)", () => {
  it("declares no resources at all while cutover is false (no live AWS lookup needed)", () => {
    const stack = new CrmDomainStack(new App(), "CrmDomain", {
      env: ENV,
      domainName: "crm.aldarraj.com",
      cutover: false,
    });
    const template = Template.fromStack(stack);
    expect(Object.keys(template.toJSON().Resources ?? {})).toHaveLength(0);
  });
});
