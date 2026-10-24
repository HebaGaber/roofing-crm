// B-09 T039: the only place the Ask screen touches the shared tRPC client (packages/api-client),
// mirroring ../Leads/leadsApi.ts's structural-typing pattern. `agent.ask` is a mutation, not a
// query, because each question is an explicit rep action, not a cacheable GET
// (contracts/agent-api.md). `agent.confirmLead` is the separate, non-model-invoked mutation that
// is the model's tool set's only path to `LeadService.create` (contracts/agent-api.md
// "Not model-invoked") — the Ask screen must call it only from an explicit rep click, never
// automatically on receiving a proposal.
import { useTRPC } from "@crm/api-client/react";
import type { AgentAnswer, Lead } from "@crm/shared";
import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

export interface AskAgentInput {
  readonly question: string;
  readonly threadId: string;
}

export interface ConfirmLeadInput {
  readonly threadId: string;
  readonly tcadId: string;
}

interface AgentTrpc {
  readonly agent: {
    readonly ask: {
      mutationOptions(): UseMutationOptions<AgentAnswer, unknown, AskAgentInput>;
    };
    readonly confirmLead: {
      mutationOptions(): UseMutationOptions<Lead, unknown, ConfirmLeadInput>;
    };
  };
}

function useAgentTrpc(): AgentTrpc {
  return useTRPC() as unknown as AgentTrpc;
}

export function useAskAgent() {
  const trpc = useAgentTrpc();
  return useMutation(trpc.agent.ask.mutationOptions());
}

export function useConfirmLead() {
  const trpc = useAgentTrpc();
  return useMutation(trpc.agent.confirmLead.mutationOptions());
}
