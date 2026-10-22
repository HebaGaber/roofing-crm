// T006 (contracts/health.md): write first, confirm it fails (no handler/router exists yet),
// then T008 makes it pass. Exercises the tRPC router directly (createCaller), not the Lambda
// envelope — the envelope is proven by cdk-nag/Powertools wiring (TN02), not a unit test.
import { describe, expect, it } from "vitest";
import { appRouter } from "../../src/routers/index.js";

describe("health.ping (contracts/health.md)", () => {
  it("returns { ok: true, timestamp } with no input and no auth", async () => {
    const caller = appRouter.createCaller({ requestId: "test-request-id" });
    const result = await caller.health.ping();
    expect(result.ok).toBe(true);
    expect(typeof result.timestamp).toBe("string");
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it("the output shape is exactly { ok, timestamp } — no extra fields", async () => {
    const caller = appRouter.createCaller({ requestId: "test-request-id" });
    const result = await caller.health.ping();
    expect(Object.keys(result).sort()).toEqual(["ok", "timestamp"]);
  });
});
