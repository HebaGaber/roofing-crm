// NFR-001 / data-model.md "agent usage / rate+spend guard": $3/day = 300 cents, checked (and
// reserved) before any model call via one atomic conditional DynamoDB UpdateItem against
// `crm-agent-usage` — same conditional-write pattern as leadRepo.ts's `expectedSequence` handling,
// and the same constructor-injected-client DI seam as `services/leads.ts`'s `createLeadService`.
//
// The condition can't express "current + estimate > cap" directly (DynamoDB condition
// expressions compare, they don't add), so the comparison is inverted into a literal computed in
// this module: `costCents <= (cap - estimate)` is exactly "current + estimate <= cap", evaluated
// against the pre-reservation balance, so a call that would push the running total over the cap
// fails the condition before anything is added.
import { UpdateCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { OverBudgetError } from "../agentErrors.js";

/** $3/day (data-model.md, NFR-001), in cents. */
export const DAILY_CAP_CENTS = 300;

/** Items are harmless to keep past their day; TTL just reclaims storage (data-model.md). */
const ITEM_TTL_SECONDS = 2 * 24 * 60 * 60;

export interface SpendCapDeps {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
  readonly now?: () => Date;
}

export interface SpendCap {
  /** Throws `OverBudgetError` when `estimatedCostCents` would push the user's running UTC-day
   *  total over the $3/day cap; otherwise atomically reserves it against that total. */
  reserve(userId: string, estimatedCostCents: number): Promise<void>;
}

function dayKey(userId: string, now: Date): string {
  const yyyyMmDd = now.toISOString().slice(0, 10);
  return `USER#${userId}#DAY#${yyyyMmDd}`;
}

/** True only for a failed condition on this single-item UpdateItem (never the transaction-style
 *  TransactionCanceledException leadRepo.ts handles — a lone UpdateItem fails this way instead). */
function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

export function createSpendCap(deps: SpendCapDeps): SpendCap {
  const { tableName, client } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async reserve(userId, estimatedCostCents) {
      const at = now();
      const ttl = Math.floor(at.getTime() / 1000) + ITEM_TTL_SECONDS;
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: dayKey(userId, at) },
            UpdateExpression: "SET #ttl = :ttl ADD #costCents :inc",
            ConditionExpression: "attribute_not_exists(pk) OR #costCents <= :threshold",
            ExpressionAttributeNames: { "#costCents": "costCents", "#ttl": "ttl" },
            ExpressionAttributeValues: {
              ":inc": estimatedCostCents,
              ":threshold": DAILY_CAP_CENTS - estimatedCostCents,
              ":ttl": ttl,
            },
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) throw new OverBudgetError(userId);
        throw error;
      }
    },
  };
}
