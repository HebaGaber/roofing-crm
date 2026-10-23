// T009: Amplify app + branch config for apps/web. The API is reached only through the Amplify
// `/api/*` same-origin rewrite (ARD-B §2.2/§8) — no cross-origin base-URL env var, so there is no
// CORS surface. Serves RUNTIME_URL (the Amplify default/preview domain) until CrmDomain cuts the
// custom domain over (Round 1 decision D-2).
import { CfnOutput, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import * as amplify from "aws-cdk-lib/aws-amplify";
import type { Construct } from "constructs";

export interface CrmWebStackProps extends StackProps {
  readonly githubRepository: string;
  readonly githubRef: string;
  readonly apiUrl: string;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
}

export class CrmWebStack extends Stack {
  public readonly app: amplify.CfnApp;
  public readonly branch: amplify.CfnBranch;

  constructor(scope: Construct, id: string, props: CrmWebStackProps) {
    super(scope, id, props);

    this.app = new amplify.CfnApp(this, "WebApp", {
      name: "roofing-crm-web",
      repository: `https://github.com/${props.githubRepository}`,
      // The GitHub OAuth token is read from Secrets Manager by the deploy operator, never
      // committed (CLAUDE.md "Never: secrets in git or logs").
      accessToken: SecretValue.secretsManager("roofing-crm/github-access-token").unsafeUnwrap(),
      platform: "WEB",
      environmentVariables: [
        { name: "AMPLIFY_MONOREPO_APP_ROOT", value: "apps/web" },
        // apps/web/src/auth/config.ts's loadCognitoWebConfig reads these at Vite build time —
        // missing, sign-in hung forever with no visible error (found deploying, AC-1).
        { name: "VITE_COGNITO_USER_POOL_ID", value: props.userPoolId },
        { name: "VITE_COGNITO_USER_POOL_CLIENT_ID", value: props.userPoolClientId },
      ],
      customRules: [
        {
          source: "/api/<*>",
          target: `${props.apiUrl}/<*>`,
          status: "200",
        },
        {
          // SPA fallback: any path with no file extension serves index.html so client-side
          // routing (react-router) handles it — otherwise a direct load of /sign-in or
          // /coming-soon/:section 404s instead of rendering the app (found deploying, AC-1/AC-5).
          source: "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>",
          target: "/index.html",
          status: "200",
        },
      ],
      buildSpec: JSON.stringify({
        version: 1,
        applications: [
          {
            appRoot: "apps/web",
            frontend: {
              phases: {
                preBuild: { commands: ["corepack enable", "pnpm install --frozen-lockfile"] },
                build: { commands: ["pnpm --filter web build"] },
              },
              artifacts: { baseDirectory: "dist", files: ["**/*"] },
              cache: { paths: ["../../node_modules/**/*"] },
            },
          },
        ],
      }),
    });

    this.branch = new amplify.CfnBranch(this, "WebBranch", {
      appId: this.app.attrAppId,
      branchName: props.githubRef.replace(/^(refs\/heads\/)?/, ""),
      enableAutoBuild: true,
      stage: "DEVELOPMENT",
    });

    new CfnOutput(this, "AmplifyDefaultDomain", {
      value: `${this.branch.branchName}.${this.app.attrDefaultDomain}`,
      description: "RUNTIME_URL for this branch until CrmDomain cuts over (TZ02).",
    });
  }
}
