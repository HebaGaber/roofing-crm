// T021 (Phase 3, INDEX, US1+US4): Promote only flips META#index.current for a Validated run
// (never Held or partial), via a DynamoDB conditional write guarded on the previous pointer
// value; a second Promote call for an already-promoted manifestCid is a no-op, not a duplicate
// write. Written first, shown failing (no handler exists yet).
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { createObservability } from "@crm/observability";
import { beforeEach, describe, expect, it } from "vitest";
import { promoteWithClient, type PromoteInput } from "../handlers/promote.js";
import type { IndexMeta } from "@crm/index-schema";

const ddbMock = mockClient(DynamoDBDocumentClient);
const obs = createObservability("Promote-test");

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";

function validatedMeta(overrides: Partial<IndexMeta> = {}): IndexMeta {
  return {
    manifestCid: MANIFEST_CID,
    status: "Validated",
    propertyCount: 14,
    permitCount: 35,
    reconcileDiff: 0,
    heldReason: null,
    finishedAt: "2026-10-21T10:40:04.525Z",
    ...overrides,
  };
}

function input(overrides: Partial<PromoteInput> = {}): PromoteInput {
  return {
    indexMeta: validatedMeta(),
    tableName: "crm-leads",
    planStartedAt: new Date(Date.now() - 1000).toISOString(),
    ...overrides,
  };
}

describe("Promote", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("flips META#index.current via a conditional write when the run is Validated", async () => {
    ddbMock.onAnyCommand().resolves({});

    const result = await promoteWithClient(
      input(),
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      obs,
    );

    expect(result.promoted).toBe(true);
    expect(result.manifestCid).toBe(MANIFEST_CID);
    expect(result.syncDurationMs).toBeGreaterThanOrEqual(0);
    expect(ddbMock.calls()).toHaveLength(1);
    const sentCommand = ddbMock.calls()[0]?.args[0];
    expect(sentCommand?.input).toMatchObject({
      ConditionExpression: expect.stringContaining("current"),
    });
  });

  it("never flips the pointer for a Held run", async () => {
    ddbMock.onAnyCommand().resolves({});

    await expect(
      promoteWithClient(
        input({
          indexMeta: validatedMeta({
            status: "Held",
            heldReason: "reconcile_diff_exceeds_tolerance",
          }),
        }),
        DynamoDBDocumentClient.from(new DynamoDBClient({})),
        obs,
      ),
    ).rejects.toThrow(/non-Validated/);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it("a second Promote call for an already-promoted manifestCid is a no-op, not a duplicate write", async () => {
    ddbMock
      .onAnyCommand()
      .rejects(new ConditionalCheckFailedException({ message: "already promoted", $metadata: {} }));

    const result = await promoteWithClient(
      input(),
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      obs,
    );

    expect(result.promoted).toBe(false);
    expect(result.syncDurationMs).toBeNull();
  });
});
