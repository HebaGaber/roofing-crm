// tRPC init (plan.md "Patterns the code must show"). One root `t` for the whole AppRouter; every
// procedure's input is Zod-validated (constitution P0-11, Article V). The Cognito JWT authorizer
// runs in API Gateway before a request reaches the Lambda (architecture-constitution.md § Data
// Flow), so there is no auth middleware here — `health.ping` and `auth.reportFailedAttempt` are
// the two routes API Gateway lets through without a token (contracts/health.md; the latter found
// deploying — see routers/auth.ts — it's called before any session exists, same reason as
// health.ping), and every other route never reaches this file without a validated token already
// attached to the request context.
import { initTRPC, TRPCError } from "@trpc/server";
import type { LeadIndex } from "./adapters/duckDbParquet.js";

export interface TrpcContext {
  readonly requestId: string;
  /** B-03 (search/property routers): the existing B-02 `LeadIndex` port, injected by the Lambda
   *  handler's `createContext` (apps/api/src/leadIndex.ts's `tryLeadIndex`). Optional so
   *  `health`/`auth` (and their existing tests, which construct a context with only `requestId`)
   *  are never forced to supply one; `search`/`property` procedures fail fast with a typed error
   *  instead of an `undefined` crash when it is missing. */
  readonly leadIndex?: LeadIndex;
}

/** `search`/`property` procedures call this first — never destructure `ctx.leadIndex` directly
 *  (it would throw "Cannot read properties of undefined" with no typed code). Typed by shape
 *  (`{ leadIndex: LeadIndex | undefined }`) rather than `TrpcContext` itself: tRPC's own resolved
 *  context type for a `.query(({ ctx }) => ...)` callback widens every optional property to an
 *  explicit union with `undefined`, which `exactOptionalPropertyTypes` treats as a different —
 *  and here, more precise — shape than `TrpcContext`'s own optional declaration. */
export function requireLeadIndex(ctx: { leadIndex: LeadIndex | undefined }): LeadIndex {
  if (ctx.leadIndex === undefined) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LeadIndex not wired into this Lambda's tRPC context",
    });
  }
  return ctx.leadIndex;
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
