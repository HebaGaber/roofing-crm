// NFR-001 / data-model.md "agent usage / rate+spend guard": 5 asks/min/user, enforced by one
// atomic conditional DynamoDB UpdateItem per check against `crm-agent-usage` — the same
// conditional-write pattern leadRepo.ts's `expectedSequence` handling uses (ConditionExpression
// evaluated by DynamoDB itself, no read-then-write race window). Constructor-injected `client`,
// the same DI seam `services/leads.ts`'s `createLeadService(leadRepo, options)` uses, so a test
// supplies a doubled DynamoDBDocumentClient instead of a real one.
import { UpdateCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { RateLimitedError } from "../agentErrors.js";

export const RATE_LIMIT_PER_MINUTE = 5;

/** Items are harmless to keep past their window; TTL just reclaims storage (data-model.md). */
const ITEM_TTL_SECONDS = 2 * 60;

export interface RateLimiterDeps {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
  readonly now?: () => Date;
}

export interface RateLimiter {
  /** Throws `RateLimitedError` when this ask would be the user's 6th+ in the current UTC minute. */
  check(userId: string): Promise<void>;
}

function windowKey(userId: string, now: Date): string {
  const windowMinute = Math.floor(now.getTime() / 60_000);
  return `USER#${userId}#MIN#${windowMinute}`;
}

/** True only for a failed condition on this single-item UpdateItem (never the transaction-style
 *  TransactionCanceledException leadRepo.ts handles — a lone UpdateItem fails this way instead). */
function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const { tableName, client } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async check(userId) {
      const at = now();
      const ttl = Math.floor(at.getTime() / 1000) + ITEM_TTL_SECONDS;
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: windowKey(userId, at) },
            UpdateExpression: "SET #ttl = :ttl ADD #count :inc",
            ConditionExpression: "attribute_not_exists(pk) OR #count < :limit",
            ExpressionAttributeNames: { "#count": "count", "#ttl": "ttl" },
            ExpressionAttributeValues: {
              ":inc": 1,
              ":limit": RATE_LIMIT_PER_MINUTE,
              ":ttl": ttl,
            },
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) throw new RateLimitedError(userId);
        throw error;
      }
    },
  };
}
