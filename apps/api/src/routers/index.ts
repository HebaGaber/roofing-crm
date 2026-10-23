// AppRouter (architecture-constitution.md §9): `health` and `auth.reportFailedAttempt` only in
// this story (the latter found deploying — see routers/auth.ts). `me`, `index`, `search`,
// `leads`, `agent` are out of scope for B-01 (contracts/health.md) and are added by later stories
// (B-02+/B-07/B-09).
import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { healthRouter } from "./health.js";

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
