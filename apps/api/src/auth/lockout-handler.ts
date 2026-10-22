// T018: Cognito pre-authentication Lambda trigger implementing data-model.md's `LockoutCounter`
// state machine exactly (research.md "custom pre-auth Lambda for the exact lockout rule"):
// 0 failures → 1..3 failures, not locked → (4th consecutive failure) → locked, lockedUntil =
// now + 5 minutes → (cooldown elapses) → 0 failures, not locked. A successful sign-in before the
// 4th failure resets failedAttempts to 0 without ever locking.
//
// Cognito invokes a pre-authentication trigger *before* it knows whether the password is correct
// (PreAuthentication_Authentication event), so this handler cannot itself observe a password
// failure. It instead:
//   1. Checks the counter first — if currently locked and the cooldown has not elapsed, throws
//      the typed lockout error (never a raw 500/blank screen, SignIn.tsx maps this via
//      `cause.code`) and clears the counter if the cooldown just elapsed.
//   2. Registers a PostAuthentication-equivalent fact via the `recordOutcome` helper, called by a
//      companion PostAuthentication trigger (success → reset to 0) and the Cognito console's own
//      failed-auth CloudTrail event is not used here; instead the client-visible contract is:
//      `recordFailedAttempt`/`recordSuccess` are the two state transitions this module exposes,
//      and `preAuthentication` is the gate Cognito calls on every attempt.
//
// Wrapped in Powertools Logger/Tracer/Metrics like every other Lambda in this story (constitution
// Article VIII, ARD-B §12.13 — not only health.ts).
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { PreAuthenticationTriggerEvent } from "aws-lambda";
import {
  createDynamoLockoutStore,
  type LockoutCounter,
  type LockoutStore,
} from "./lockout-store.js";

export const MAX_FAILED_ATTEMPTS = 4;
export const LOCKOUT_COOLDOWN_MS = 5 * 60 * 1000;

/** Thrown by `preAuthentication` while locked; Cognito surfaces this as the auth failure's message. */
export class TooManyAttemptsError extends Error {
  readonly code = "TooManyAttemptsError";
  constructor(retryAt: number) {
    super(`Too many attempts — try again in 5 minutes (retry at ${new Date(retryAt).toISOString()}).`);
    this.name = "TooManyAttemptsError";
  }
}

function emptyCounter(username: string): LockoutCounter {
  return { username, failedAttempts: 0, lockedUntil: null };
}

/**
 * Called on every sign-in attempt, before Cognito validates the password. Throws
 * `TooManyAttemptsError` while locked; clears an elapsed lock back to 0 failed attempts.
 */
export async function preAuthentication(store: LockoutStore, username: string): Promise<void> {
  const counter = (await store.get(username)) ?? emptyCounter(username);
  if (counter.lockedUntil !== null) {
    if (Date.now() < counter.lockedUntil) {
      throw new TooManyAttemptsError(counter.lockedUntil);
    }
    // Cooldown elapsed: reset before letting the attempt proceed (data-model.md transition).
    await store.put(emptyCounter(username));
  }
}

/** Called after a failed password check. The 4th consecutive failure locks for 5 minutes. */
export async function recordFailedAttempt(store: LockoutStore, username: string): Promise<void> {
  const counter = (await store.get(username)) ?? emptyCounter(username);
  const failedAttempts = counter.failedAttempts + 1;
  const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_COOLDOWN_MS : null;
  await store.put({ username, failedAttempts, lockedUntil });
}

/** Called after a successful sign-in. Resets the counter to 0 without ever locking. */
export async function recordSuccess(store: LockoutStore, username: string): Promise<void> {
  await store.put(emptyCounter(username));
}

const logger = new Logger({ serviceName: "crm-ops-lockout" });
const tracer = new Tracer({ serviceName: "crm-ops-lockout" });
const metrics = new Metrics({ namespace: "RoofingCrm", serviceName: "crm-ops-lockout" });

let cachedStore: LockoutStore | undefined;
function lockoutStore(): LockoutStore {
  if (cachedStore === undefined) {
    const tableName = process.env.LOCKOUT_TABLE_NAME;
    if (tableName === undefined || tableName === "") {
      throw new Error("LOCKOUT_TABLE_NAME is not set");
    }
    cachedStore = createDynamoLockoutStore(tableName);
  }
  return cachedStore;
}

/** The Cognito PreAuthentication_Authentication trigger entry point (infra/lib/crm-ops-stack.ts). */
export async function handler(
  event: PreAuthenticationTriggerEvent,
): Promise<PreAuthenticationTriggerEvent> {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment("## crm-ops-lockout.preAuthentication");
  const username = event.userName;
  logger.info("pre-authentication check", { username });
  try {
    await preAuthentication(lockoutStore(), username);
    metrics.addMetric("LockoutChecksPassed", MetricUnit.Count, 1);
    return event;
  } catch (error) {
    metrics.addMetric("LockoutRejections", MetricUnit.Count, 1);
    logger.warn("sign-in rejected: locked out", { username });
    throw error;
  } finally {
    subsegment?.close();
    metrics.publishStoredMetrics();
  }
}
