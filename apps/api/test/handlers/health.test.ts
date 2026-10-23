// T006 (contracts/health.md): write first, confirm it fails (no handler/router exists yet),
// then T008 makes it pass. Exercises the tRPC router directly (createCaller), not the Lambda
// envelope — the envelope is proven by cdk-nag/Powertools wiring (TN02), not a unit test.
import { describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { stripTrpcPrefix } from "../../src/handlers/health.js";
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

describe("stripTrpcPrefix (found deploying: the exact, unauthorized health.ping route has no {proxy+} path param, so the tRPC Lambda adapter otherwise derives the procedure path from the full rawPath, '/trpc' prefix and all)", () => {
  const baseEvent = { rawPath: "" } as APIGatewayProxyEventV2;

  it("strips a leading /trpc from rawPath", () => {
    const event = { ...baseEvent, rawPath: "/trpc/health.ping" };
    expect(stripTrpcPrefix(event).rawPath).toBe("/health.ping");
  });

  it("leaves a path with no /trpc prefix untouched", () => {
    const event = { ...baseEvent, rawPath: "/health.ping" };
    expect(stripTrpcPrefix(event)).toBe(event);
  });
});
