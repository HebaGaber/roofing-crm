// B-07 test cleanup (GAP-3: no lead-delete exists in the product, and a second create on the same
// property is refused by design, so reruns need the four test leads removed first). Deletes ONLY
// items whose pk is one of the (at most four) allow-listed test-lead keys from DynamoDB `crm-leads`
// (eu-north-1), using the default AWS credential chain. Credentials are never read or printed
// here; any other pk is refused before a request is made.
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  QueryCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";

export const LEADS_TABLE = "crm-leads";
export const LEADS_REGION = "eu-north-1";

const LEAD_KEY_PATTERN = /^48453:tcad:[A-Za-z0-9_-]+$/;
const MAX_ALLOWED_KEYS = 4;
const BATCH_LIMIT = 25; // BatchWriteItem accepts at most 25 requests per call.

export interface LeadsCleanup {
  /** The frozen allow-list: the only pks this helper will ever touch. */
  readonly allowed: readonly string[];
  /** Deletes every item under each pk; returns the number of items removed. */
  deleteLeads(leadKeys: readonly string[]): Promise<number>;
}

/** `allowedLeadKeys` are the `48453:tcad:{request_identifier}` keys of the test leads: three real
 *  properties (the spec reads each request identifier from the live index, never guesses it) plus
 *  the B07STALE fixture. */
export function createLeadsCleanup(allowedLeadKeys: readonly string[]): LeadsCleanup {
  if (allowedLeadKeys.length === 0 || allowedLeadKeys.length > MAX_ALLOWED_KEYS) {
    throw new Error(`leads cleanup: the allow-list must hold 1 to ${MAX_ALLOWED_KEYS} lead keys`);
  }
  for (const key of allowedLeadKeys) {
    if (!LEAD_KEY_PATTERN.test(key)) throw new Error(`leads cleanup: "${key}" is not a lead key`);
  }
  const allowed = Object.freeze([...allowedLeadKeys]);
  const client = new DynamoDBClient({ region: LEADS_REGION });

  async function deleteLeads(leadKeys: readonly string[]): Promise<number> {
    for (const key of leadKeys) {
      if (!allowed.includes(key)) {
        throw new Error(`leads cleanup refused: "${key}" is not in the allow-list`);
      }
    }
    let removed = 0;
    for (const key of leadKeys) {
      const keys: Record<string, AttributeValue>[] = [];
      let startKey: Record<string, AttributeValue> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: LEADS_TABLE,
            KeyConditionExpression: "pk = :pk",
            ExpressionAttributeValues: { ":pk": { S: key } },
            ProjectionExpression: "pk, sk",
            ConsistentRead: true,
            ...(startKey === undefined ? {} : { ExclusiveStartKey: startKey }),
          }),
        );
        for (const item of page.Items ?? []) {
          if (item.pk?.S !== key || item.sk === undefined) continue; // never delete a stray pk
          keys.push({ pk: item.pk, sk: item.sk });
        }
        startKey = page.LastEvaluatedKey;
      } while (startKey !== undefined);

      for (let i = 0; i < keys.length; i += BATCH_LIMIT) {
        let pending: Record<string, { DeleteRequest: { Key: Record<string, AttributeValue> } }[]> =
          {
            [LEADS_TABLE]: keys
              .slice(i, i + BATCH_LIMIT)
              .map((Key) => ({ DeleteRequest: { Key } })),
          };
        // Unprocessed items (throttling) are retried until the batch is empty.
        while (Object.values(pending).some((requests) => requests.length > 0)) {
          const out = await client.send(new BatchWriteItemCommand({ RequestItems: pending }));
          pending = (out.UnprocessedItems ?? {}) as typeof pending;
        }
      }
      removed += keys.length;
    }
    return removed;
  }

  return { allowed, deleteLeads };
}
