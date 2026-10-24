// B-09 T039: the only place the Ask screen touches the shared tRPC client (packages/api-client).
// `agent.ask` is a mutation, not a query, because each question is an explicit rep action, not a
// cacheable GET (contracts/agent-api.md). `agent.confirmLead` is the separate, non-model-invoked
// mutation that is the only path to `LeadService.create` (contracts/agent-api.md "Not
// model-invoked") — the Ask screen calls it only from an explicit rep click, never automatically
// on receiving a proposal.
//
// CR-B-09 finding 19: typed by the real `AppRouter` through `useTRPC()` (the `agent` router is mounted
// in apps/api/src/routers/index.ts) — no structural double cast, so a contract change on
// the server is a type error here.
import { useTRPC } from "@crm/api-client/react";
import { useMutation, useQuery } from "@tanstack/react-query";

/** The promoted run the answers cite (the composer's "answers cite CountyLens run {n}" line). The
 *  same `shell.indexInfo` query the top bar's data chip reads, so it shares that cache entry. */
export function useRunInfo() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.shell.indexInfo.queryOptions(), staleTime: 5 * 60_000 });
}

export function useAskAgent() {
  const trpc = useTRPC();
  return useMutation(trpc.agent.ask.mutationOptions());
}

export function useConfirmLead() {
  const trpc = useTRPC();
  return useMutation(trpc.agent.confirmLead.mutationOptions());
}
