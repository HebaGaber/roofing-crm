// B-07: the only place the Leads screens touch the shared tRPC client (packages/api-client).
// Components call these hooks; tests mock this module. The `leads` router (Group GA,
// apps/api/src/routers/leads.ts) is typed here structurally from contracts/leads.md so the web
// app compiles whether or not AppRouter already carries it.
import { useTRPC } from "@crm/api-client/react";
import type { Lead, LeadEvent, LeadFilters, LeadSignals, LeadStatus } from "@crm/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { LeadsListInput } from "./leadFilters.state.js";

export type LeadListItem = Lead & { readonly leadKey: string; readonly notInCurrentRun: boolean };
export interface LeadsListOutput {
  readonly leads: LeadListItem[];
  readonly nextCursor?: string;
  readonly totalCount: number;
}
export type LeadDetailData = Lead & {
  readonly leadKey: string;
  readonly signals: LeadSignals;
  readonly notes: LeadEvent[];
  readonly history: LeadEvent[];
  readonly notInCurrentRun: boolean;
  readonly currentManifestCid?: string | undefined;
  readonly currentRunId?: string | undefined;
};
export interface LeadCreateInput {
  readonly fips: string;
  readonly requestIdentifier: string;
  readonly address: string;
  readonly lat: number;
  readonly lon: number;
  readonly signals: Omit<LeadSignals, "capturedAt">;
  readonly sourceManifestCid: string;
  readonly createdFrom: "map" | "list" | "agent";
}

interface LeadsTrpc {
  readonly leads: {
    readonly list: {
      queryOptions(input: LeadsListInput): UseQueryOptions<LeadsListOutput>;
      queryKey(): readonly unknown[];
    };
    readonly get: {
      queryOptions(input: { leadKey: string }): UseQueryOptions<LeadDetailData>;
      queryKey(): readonly unknown[];
    };
    readonly create: {
      mutationOptions(): UseMutationOptions<Lead, unknown, LeadCreateInput>;
    };
    readonly updateStatus: {
      mutationOptions(): UseMutationOptions<Lead, unknown, { leadKey: string; status: LeadStatus }>;
    };
    readonly addNote: {
      mutationOptions(): UseMutationOptions<Lead, unknown, { leadKey: string; text: string }>;
    };
  };
}

function useLeadsTrpc(): LeadsTrpc {
  return useTRPC() as unknown as LeadsTrpc;
}

export type { LeadFilters };

export function useLeadsList(input: LeadsListInput) {
  const trpc = useLeadsTrpc();
  return useQuery(trpc.leads.list.queryOptions(input));
}

export function useLead(leadKey: string) {
  const trpc = useLeadsTrpc();
  return useQuery(trpc.leads.get.queryOptions({ leadKey }));
}

/** Creating a lead refreshes any cached list so the new lead appears without a reload. */
export function useCreateLead() {
  const trpc = useLeadsTrpc();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.leads.create.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.leads.list.queryKey() }),
  });
}

export function useUpdateLeadStatus() {
  const trpc = useLeadsTrpc();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.leads.updateStatus.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.leads.get.queryKey() });
      await queryClient.invalidateQueries({ queryKey: trpc.leads.list.queryKey() });
    },
  });
}

export function useAddLeadNote() {
  const trpc = useLeadsTrpc();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.leads.addNote.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.leads.get.queryKey() }),
  });
}
