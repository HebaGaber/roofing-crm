// CR finding 2 (gateway half): the Vercel AI Gateway key is not wired from Secrets Manager in
// this deployment, so the gateway path fails with a typed config error instead of a provider
// auth error at the first model call. Bedrock is unaffected.
import { afterEach, describe, expect, it } from "vitest";
import {
  GatewayKeyNotWiredError,
  getModel,
  resetModelCacheForTest,
} from "../../src/agent/getModel.js";

afterEach(() => resetModelCacheForTest());

describe("getModel", () => {
  it("builds the Bedrock model from AGENT_MODEL_ID", () => {
    const model = getModel({
      AI_PROVIDER: "bedrock",
      AGENT_MODEL_ID: "eu.anthropic.claude-sonnet-4-6",
    });
    expect(typeof model === "string" ? model : model.modelId).toBe(
      "eu.anthropic.claude-sonnet-4-6",
    );
  });

  it("fails typed on the gateway path when no Gateway key is available", () => {
    expect(() =>
      getModel({ AI_PROVIDER: "gateway", AGENT_MODEL_ID: "anthropic/claude-sonnet-4.6" }),
    ).toThrow(GatewayKeyNotWiredError);
  });
});
