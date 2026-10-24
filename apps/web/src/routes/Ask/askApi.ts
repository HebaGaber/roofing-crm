// B-09 T039: the only place the Ask screen touches the shared tRPC client (packages/api-client).
// `agent.ask` is a mutation, not a query, because each question is an explicit rep action, not a
// cacheable GET (contracts/agent-api.md). `agent.confirmLead` is the separate, non-model-invoked
// mutation that is the only path to `LeadService.create` (contracts/agent-api.md "Not
// model-invoked") — the Ask screen calls it only from an explicit rep click, never automatically
// on receiving a proposal.
//
// CR-B-09 #19: typed by the real `AppRouter` through `useTRPC()` (the `agent` router is mounted
// in apps/api/src/routers/index.ts) — no structural double cast, so a contract change on
// the server is a type error here.
import { useTRPC } from "@crm/api-client/react";
import { useMutation } from "@tanstack/react-query";

export function useAskAgent() {
  const trpc = useTRPC();
  return useMutation(trpc.agent.ask.mutationOptions());
}

export function useConfirmLead() {
  const trpc = useTRPC();
  return useMutation(trpc.agent.confirmLead.mutationOptions());
}
