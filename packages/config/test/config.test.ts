import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.js";

describe("loadConfig", () => {
  it("resolves region from CDK_DEFAULT_REGION", () => {
    expect(loadConfig({ CDK_DEFAULT_REGION: "eu-north-1" })).toEqual({ region: "eu-north-1" });
  });

  it("falls back to AWS_REGION", () => {
    expect(loadConfig({ AWS_REGION: "eu-north-1" })).toEqual({ region: "eu-north-1" });
  });

  it("prefers CDK_DEFAULT_REGION over AWS_REGION", () => {
    expect(loadConfig({ CDK_DEFAULT_REGION: "eu-north-1", AWS_REGION: "us-east-2" })).toEqual({
      region: "eu-north-1",
    });
  });

  it("fails fast when no region is set", () => {
    expect(() => loadConfig({})).toThrow(/no region resolved/);
  });

  it("fails fast on a disallowed region (region-lock, CLAUDE.md)", () => {
    expect(() => loadConfig({ AWS_REGION: "us-east-2" })).toThrow(/not an allowed region/);
  });
});
