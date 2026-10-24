// T016 (Phase 2 Foundational): the `crm-agent-usage` spend-cap guard — $3/day = 300 cents, checked
// before any model call via one atomic conditional UpdateItem (data-model.md "agent usage /
// rate+spend guard"), same pattern as leadRepo.ts's `expectedSequence` conditional update.
// DynamoDB is doubled with aws-sdk-client-mock; nothing reaches AWS.
// `apps/api/src/agent/spendCap.ts` does not exist yet — T018 implements it.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createSpendCap, DAILY_CAP_CENTS } from "../../src/agent/spendCap.js";
import { OverBudgetError } from "../../src/agentErrors.js";

const ddbMock = mockClient(DynamoDBDocumentClient);

function conditionalCheckFailed(): Error {
  return Object.assign(new Error("The conditional request failed"), {
    name: "ConditionalCheckFailedException",
  });
}

function makeSpendCap(now: () => Date = () => new Date("2026-10-24T10:00:00.000Z")) {
  return createSpendCap({
    tableName: "crm-agent-usage",
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    now,
  });
}

describe("spendCap (T016)", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("reserves an estimated cost within the remaining daily budget", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const spendCap = makeSpendCap();

    await expect(spendCap.reserve("user-1", 50)).resolves.toBeUndefined();
  });

  it("rejects with OverBudgetError when the estimated cost would exceed the $3/day cap, checked before any model call", async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());
    const spendCap = makeSpendCap();

    await expect(spendCap.reserve("user-1", 10)).rejects.toBeInstanceOf(OverBudgetError);
  });

  it("sends one atomic conditional UpdateItem per reserve, keyed by user + UTC day, condition guarding against exceeding the cap", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const spendCap = makeSpendCap(() => new Date("2026-10-24T10:00:00.000Z"));

    await spendCap.reserve("user-42", 75);

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]?.args[0]?.input;
    expect(input?.TableName).toBe("crm-agent-usage");
    expect(input?.Key?.pk).toBe("USER#user-42#DAY#2026-10-24");
    expect(input?.ConditionExpression).toMatch(/attribute_not_exists\(pk\)\s+OR/);
    expect(DAILY_CAP_CENTS).toBe(300);
    // The condition compares the *pre-reservation* balance against (cap - estimate), so a call
    // that would push the running total over the cap fails before it is ever added.
    expect(input?.ExpressionAttributeValues?.[":threshold"]).toBe(DAILY_CAP_CENTS - 75);
    expect(input?.ExpressionAttributeValues?.[":inc"]).toBe(75);
  });

  it("propagates an unrelated DynamoDB error unchanged (never masked as OverBudgetError)", async () => {
    ddbMock.on(UpdateCommand).rejects(new Error("ProvisionedThroughputExceededException"));
    const spendCap = makeSpendCap();

    await expect(spendCap.reserve("user-1", 10)).rejects.not.toBeInstanceOf(OverBudgetError);
  });

  it("resets the cap once the UTC day changes", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    let nowMs = new Date("2026-10-24T23:59:59.000Z").getTime();
    const spendCap = makeSpendCap(() => new Date(nowMs));

    await spendCap.reserve("user-1", 100);
    nowMs += 2_000; // crosses into the next UTC day
    await expect(spendCap.reserve("user-1", 100)).resolves.toBeUndefined();

    const keys = ddbMock
      .commandCalls(UpdateCommand)
      .map((c) => c.args[0]?.input?.Key?.pk as string);
    expect(new Set(keys).size).toBe(2);
  });
});
