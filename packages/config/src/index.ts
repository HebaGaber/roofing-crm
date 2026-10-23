// @crm/config: the one place the region is read from the environment (architecture-constitution.md
// §9's module-boundary table: "Hard-code a region, model id, or threshold anywhere else in the
// codebase" is a Must-not for every other module). Region comes from CDK_DEFAULT_REGION or
// AWS_REGION — never a literal — and is validated against the region(s) this project is locked to
// (CLAUDE.md: "region-locked to eu-north-1"). Fails fast (throws) at import/cold-start time if the
// environment does not resolve to an allowed region, rather than silently defaulting.
import { z } from "zod";
// Reused as a plain predicate, not a schema object: packages/oracle-contract is vendored on
// zod v4 (ADR-07, pinned verbatim) while this workspace's own code is on zod v3 — the two
// majors' schema internals aren't interchangeable, so only `isCidV1`'s boolean check crosses
// that boundary, never a cross-major `CidV1` schema instance.
import { isCidV1 } from "@crm/oracle-contract/cid";

export const AllowedRegion = z.enum(["eu-north-1"]);
export type AllowedRegion = z.infer<typeof AllowedRegion>;

export const RuntimeConfig = z.object({
  region: AllowedRegion,
  // The sample-or-full-county manifest this run reads, per B-02's explicit rule: never a
  // hard-coded constant anywhere in the codebase, so the later full-county data switch
  // (WALKTHROUGH-B-sample-first.md §2) is a one-setting change, not a code change.
  dataManifestCid: z.string().refine(isCidV1, { message: "expected a base32 CIDv1 string" }),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfig>;

export type LoadConfigEnv = Record<string, string | undefined>;

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
  if (!AllowedRegion.safeParse(region).success) {
    throw new Error(
      `@crm/config: region "${region}" is not an allowed region for this project (${AllowedRegion.options.join(", ")}).`,
    );
  }
  const dataManifestCid = env.DATA_MANIFEST_CID;
  if (dataManifestCid === undefined || dataManifestCid === "") {
    throw new Error(
      "@crm/config: DATA_MANIFEST_CID is not set — refusing to default to any manifest.",
    );
  }
  const parsed = RuntimeConfig.safeParse({ region, dataManifestCid });
  if (!parsed.success) {
    throw new Error(
      `@crm/config: DATA_MANIFEST_CID "${dataManifestCid}" is not a valid base32 CIDv1 string.`,
    );
  }
  return parsed.data;
}
