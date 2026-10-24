import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.js";

const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const DEFAULT_AI_FIELDS = { aiProvider: "bedrock", agentModelId: "eu.anthropic.claude-sonnet-4-6" };

describe("loadConfig", () => {
  it("resolves region from CDK_DEFAULT_REGION", () => {
    expect(
      loadConfig({ CDK_DEFAULT_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID, ...DEFAULT_AI_FIELDS });
  });

  it("falls back to AWS_REGION", () => {
    expect(
      loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID, ...DEFAULT_AI_FIELDS });
  });

  it("prefers CDK_DEFAULT_REGION over AWS_REGION", () => {
    expect(
      loadConfig({
        CDK_DEFAULT_REGION: "eu-north-1",
        AWS_REGION: "us-east-2",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
      }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID, ...DEFAULT_AI_FIELDS });
  });

  it("fails fast when no region is set", () => {
    expect(() => loadConfig({})).toThrow(/no region resolved/);
  });

  it("fails fast on a disallowed region (region-lock, CLAUDE.md)", () => {
    expect(() => loadConfig({ AWS_REGION: "us-east-2" })).toThrow(/not an allowed region/);
  });

  it("reads DATA_MANIFEST_CID from the environment, never a hard-coded constant", () => {
    expect(
      loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID }),
    ).toEqual({
      region: "eu-north-1",
      dataManifestCid: SAMPLE_MANIFEST_CID,
      ...DEFAULT_AI_FIELDS,
    });
  });

  it("fails fast when DATA_MANIFEST_CID is missing", () => {
    expect(() => loadConfig({ AWS_REGION: "eu-north-1" })).toThrow(/DATA_MANIFEST_CID/);
  });

  it("fails fast when DATA_MANIFEST_CID is not a CIDv1 string", () => {
    expect(() => loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: "not-a-cid" })).toThrow(
      /DATA_MANIFEST_CID/,
    );
  });

  it("defaults AI_PROVIDER to bedrock and AGENT_MODEL_ID to the ADR-06 default (constitution VI)", () => {
    const config = loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID });
    expect(config.aiProvider).toBe("bedrock");
    expect(config.agentModelId).toBe("eu.anthropic.claude-sonnet-4-6");
  });

  it("reads AI_PROVIDER=gateway and defaults AGENT_MODEL_ID to the gateway model id", () => {
    const config = loadConfig({
      AWS_REGION: "eu-north-1",
      DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
      AI_PROVIDER: "gateway",
    });
    expect(config.aiProvider).toBe("gateway");
    expect(config.agentModelId).toBe("anthropic/claude-sonnet-4.6");
  });

  it("reads an explicit AGENT_MODEL_ID over the default", () => {
    const config = loadConfig({
      AWS_REGION: "eu-north-1",
      DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
      AGENT_MODEL_ID: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    });
    expect(config.agentModelId).toBe("eu.anthropic.claude-haiku-4-5-20251001-v1:0");
  });

  it("fails fast on an unsupported AI_PROVIDER", () => {
    expect(() =>
      loadConfig({
        AWS_REGION: "eu-north-1",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
        AI_PROVIDER: "openai",
      }),
    ).toThrow(/AI_PROVIDER/);
  });
});
