// T025 (Phase 3, INDEX, [P] — fixes G5 C-04): the LeadIndex port's typed-error contract
// (INDEX_NOT_READY when no run has ever promoted, INDEX_COLD_LOAD_TIMEOUT on a fixture that
// exceeds the cold-load budget), before any adapter code exists. Written first, shown failing.
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { createObservability } from "@crm/observability";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DuckDbParquetLeadIndex,
  IndexColdLoadTimeoutError,
  IndexNotReadyError,
} from "../src/adapters/duckDbParquet.js";

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const obs = createObservability("LeadIndex-test");

function makeIndex(
  overrides: Partial<ConstructorParameters<typeof DuckDbParquetLeadIndex>[0]> = {},
) {
  return new DuckDbParquetLeadIndex({
    ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3: new S3Client({}),
    tableName: "crm-leads",
    bucket: "crm-index",
    obs,
    coldLoadTimeoutMs: 50,
    tmpDir: `/tmp/crm-index-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });
}

describe("LeadIndex (DuckDB over S3 Parquet)", () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
  });

  it("throws INDEX_NOT_READY when no run has ever been promoted", async () => {
    ddbMock.onAnyCommand().resolves({ Item: undefined });

    const index = makeIndex();

    await expect(index.indexInfo()).rejects.toThrow(IndexNotReadyError);
    await expect(index.indexInfo()).rejects.toMatchObject({ code: "INDEX_NOT_READY" });
  });

  it("throws INDEX_COLD_LOAD_TIMEOUT when the cold load exceeds its budget", async () => {
    ddbMock.onAnyCommand().resolves({
      Item: {
        pk: "META#index",
        current: "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq",
      },
    });
    // S3 never resolves within the 50ms cold-load budget configured above.
    s3Mock.onAnyCommand().callsFake(() => new Promise(() => undefined));

    const index = makeIndex();

    await expect(index.searchProperties({})).rejects.toThrow(IndexColdLoadTimeoutError);
    await expect(index.searchProperties({})).rejects.toMatchObject({
      code: "INDEX_COLD_LOAD_TIMEOUT",
    });
  });
});
