// tRPC init (plan.md "Patterns the code must show"). One root `t` for the whole AppRouter; every
// procedure's input is Zod-validated (constitution P0-11, Article V). The Cognito JWT authorizer
// runs in API Gateway before a request reaches the Lambda (architecture-constitution.md § Data
// Flow), so there is no auth middleware here — `health.ping` is the one route API Gateway lets
// through without a token (contracts/health.md), and every other route never reaches this file
// without a validated token already attached to the request context.
import { initTRPC } from "@trpc/server";

export interface TrpcContext {
  readonly requestId: string;
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
