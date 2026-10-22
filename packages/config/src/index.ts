// @crm/config: the one place the region is read from the environment (architecture-constitution.md
// §9's module-boundary table: "Hard-code a region, model id, or threshold anywhere else in the
// codebase" is a Must-not for every other module). Region comes from CDK_DEFAULT_REGION or
// AWS_REGION — never a literal — and is validated against the region(s) this project is locked to
// (CLAUDE.md: "region-locked to eu-north-1"). Fails fast (throws) at import/cold-start time if the
// environment does not resolve to an allowed region, rather than silently defaulting.
import { z } from "zod";

export const AllowedRegion = z.enum(["eu-north-1"]);
export type AllowedRegion = z.infer<typeof AllowedRegion>;

export const RuntimeConfig = z.object({
  region: AllowedRegion,
});
export type RuntimeConfig = z.infer<typeof RuntimeConfig>;

export interface LoadConfigEnv {
  readonly CDK_DEFAULT_REGION?: string;
  readonly AWS_REGION?: string;
}

/**
 * Resolves and validates the runtime region. Reads `CDK_DEFAULT_REGION` first (set by the CDK CLI
 * from the active AWS profile), then `AWS_REGION` (set by the Lambda runtime), and throws
 * immediately if neither is set or the value isn't one of this project's allowed regions — a
 * misconfigured deploy must fail at cold start, not silently run in the wrong region.
 */
export function loadConfig(env: LoadConfigEnv = process.env): RuntimeConfig {
  const region = env.CDK_DEFAULT_REGION ?? env.AWS_REGION;
  if (region === undefined || region === "") {
    throw new Error(
      "@crm/config: no region resolved from CDK_DEFAULT_REGION or AWS_REGION — refusing to default.",
    );
  }
  const parsed = RuntimeConfig.safeParse({ region });
  if (!parsed.success) {
    throw new Error(
      `@crm/config: region "${region}" is not an allowed region for this project (${AllowedRegion.options.join(", ")}).`,
    );
  }
  return parsed.data;
}
