// Typed agent errors shared by the Application layer (agent/rateLimiter.ts, agent/spendCap.ts)
// and the Entry layer (routers/agent.ts, once it exists), which maps them to tRPC codes. Mirrors
// leadErrors.ts exactly: a `code` field carrying the DynamoDB cancellation reason, and messages
// that never carry the question text or an address (P0-13).
export { IndexNotReadyError } from "./adapters/duckDbParquet.js";

/** True only for a failed condition on a single-item UpdateItem (never the transaction-style
 *  TransactionCanceledException leadRepo.ts handles — a lone UpdateItem fails this way instead). */
export function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

/** The 6th+ `agent.ask` in the same user+minute window (NFR-001: 5 asks/min/user). `code` is the
 *  DynamoDB cancellation reason the conditional UpdateItem produced. */
export class RateLimitedError extends Error {
  readonly code = "ConditionalCheckFailed";
  constructor(readonly userId: string) {
    super(`User ${userId} exceeded 5 asks/min; wait for the next window`);
    this.name = "RateLimitedError";
  }
}

/** A call whose estimated cost would push the caller's running UTC-day total over the $3/day cap
 *  (checked before any model call, never after). `code` is the DynamoDB cancellation reason. */
export class OverBudgetError extends Error {
  readonly code = "ConditionalCheckFailed";
  constructor(readonly userId: string) {
    super(`User ${userId} would exceed the $3/day agent spend cap`);
    this.name = "OverBudgetError";
  }
}
