// TD-5: the Lambda envelope itself (handler's triggerSource dispatch, the lockoutStore()
// singleton, the LOCKOUT_TABLE_NAME guard) — previously only the pure state machine
// (lockout-handler.test.ts) and the DynamoDB adapter's shape validation (lockout-store.test.ts)
// were unit-tested; this is what ran live in practice but was never exercised in Vitest. Mocks
// the AWS SDK at the module boundary (DynamoDBDocumentClient.send) rather than real DynamoDB.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostAuthenticationTriggerEvent, PreAuthenticationTriggerEvent } from "aws-lambda";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(),
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: sendMock })) },
  GetCommand: class {
    __commandName = "Get";
    constructor(public input: unknown) {}
  },
  PutCommand: class {
    __commandName = "Put";
    constructor(public input: unknown) {}
  },
}));

function preAuthEvent(username: string): PreAuthenticationTriggerEvent {
  return {
    triggerSource: "PreAuthentication_Authentication",
    userName: username,
    request: { userAttributes: {} },
    response: {},
  } as unknown as PreAuthenticationTriggerEvent;
}

function postAuthEvent(username: string): PostAuthenticationTriggerEvent {
  return {
    triggerSource: "PostAuthentication_Authentication",
    userName: username,
    request: { userAttributes: {} },
    response: {},
  } as unknown as PostAuthenticationTriggerEvent;
}

describe("lockout-handler.ts's Lambda envelope (handler, lockoutStore())", () => {
  const USERNAME = "admin@roofing-crm.test";

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    process.env.LOCKOUT_TABLE_NAME = "test-lockout-table";
  });

  afterEach(() => {
    delete process.env.LOCKOUT_TABLE_NAME;
  });

  it("throws if LOCKOUT_TABLE_NAME is not set", async () => {
    delete process.env.LOCKOUT_TABLE_NAME;
    const { handler } = await import("../../src/auth/lockout-handler.js");
    await expect(handler(preAuthEvent(USERNAME))).rejects.toThrow("LOCKOUT_TABLE_NAME is not set");
  });

  it("PreAuthentication: an unlocked account's event passes through unchanged", async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined }); // store.get: no counter yet
    const { handler } = await import("../../src/auth/lockout-handler.js");
    const event = preAuthEvent(USERNAME);
    const result = await handler(event);
    expect(result).toBe(event);
  });

  it("PreAuthentication: a locked account (cooldown not elapsed) rejects with TooManyAttemptsError", async () => {
    sendMock.mockResolvedValueOnce({
      Item: { username: USERNAME, failedAttempts: 4, lockedUntil: Date.now() + 60_000 },
    });
    const { handler, TooManyAttemptsError } = await import("../../src/auth/lockout-handler.js");
    await expect(handler(preAuthEvent(USERNAME))).rejects.toBeInstanceOf(TooManyAttemptsError);
  });

  it("PostAuthentication: resets the counter to 0 on a real successful sign-in", async () => {
    sendMock.mockResolvedValueOnce({}); // store.put resolves
    const { handler } = await import("../../src/auth/lockout-handler.js");
    const event = postAuthEvent(USERNAME);
    const result = await handler(event);
    expect(result).toBe(event);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const putCall = sendMock.mock.calls[0]?.[0] as { __commandName: string; input: unknown };
    expect(putCall.__commandName).toBe("Put");
    expect(putCall.input).toMatchObject({
      TableName: "test-lockout-table",
      Item: { username: USERNAME, failedAttempts: 0, lockedUntil: null },
    });
  });
});
