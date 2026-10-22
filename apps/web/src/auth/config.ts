// Web-side analog of @crm/config's fail-fast pattern: Vite build-time env vars (set by the
// Amplify build, infra/lib/crm-web-stack.ts), validated once, never read ad hoc elsewhere in the
// app. @crm/config itself is Node-only (CDK_DEFAULT_REGION) and isn't bundled into the browser.
import { z } from "zod";

const CognitoWebConfig = z.object({
  userPoolId: z.string().min(1),
  userPoolClientId: z.string().min(1),
});
export type CognitoWebConfig = z.infer<typeof CognitoWebConfig>;

export function loadCognitoWebConfig(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<
    string,
    string | undefined
  >,
): CognitoWebConfig {
  const parsed = CognitoWebConfig.safeParse({
    userPoolId: env.VITE_COGNITO_USER_POOL_ID,
    userPoolClientId: env.VITE_COGNITO_USER_POOL_CLIENT_ID,
  });
  if (!parsed.success) {
    throw new Error(
      "Cognito web config missing: set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_USER_POOL_CLIENT_ID.",
    );
  }
  return parsed.data;
}
