// B-07: the only place the Leads screens touch the shared tRPC client (packages/api-client).
// Components call these hooks; tests mock this module. Typed by the real `AppRouter` through
// `useTRPC()` (the `leads` router is mounted in apps/api/src/routers/index.ts), and the screen
// types below are the router's own inferred inputs/outputs: a contract change on the server is a
// type error here, not a silent structural mismatch (B-09 follow-up, review: no double cast).
import type { ApiInputs, ApiOutputs } from "@crm/api-client";
import { useTRPC } from "@crm/api-client/react";
import type { LeadFilters } from "@crm/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { LeadsListInput } from "./leadFilters.state.js";
import { retryUnlessNotFound } from "./leadErrors.js";
import { addCreatedLead, overlayLeadsList } from "./leadsListCache.js";

export type LeadsListOutput = ApiOutputs["leads"]["list"];
export type LeadListItem = LeadsListOutput["leads"][number];
export type LeadDetailData = ApiOutputs["leads"]["get"];
export type LeadCreateInput = ApiInputs["leads"]["create"];

export type { LeadFilters };

export function useLeadsList(input: LeadsListInput, options: { readonly enabled?: boolean } = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // A lead created a moment ago is kept while a refetch that has not caught up lacks it.
  const inputKey = JSON.stringify(input);
  // `inputKey` is the input's identity (the input object itself is rebuilt every render).
  const select = useCallback(
    (data: LeadsListOutput) => overlayLeadsList(queryClient, input, data),
    [queryClient, inputKey],
  );
  return useQuery({
    ...trpc.leads.list.queryOptions(input),
    select,
    enabled: options.enabled ?? true,
  });
}

export function useLead(leadKey: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.leads.get.queryOptions({ leadKey }), retry: retryUnlessNotFound });
}

/** A created lead goes straight into the cached Leads list (so /leads paints its row from cache)
 *  and the lists refetch in the background, never awaited. A failed or duplicate (409) create
 *  never reaches `onSuccess`, so it inserts nothing. */
export function useCreateLead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.leads.create.mutationOptions(),
    onSuccess: (lead) => addCreatedLead(queryClient, trpc.leads.list.queryKey(), lead),
  });
}

export function useUpdateLeadStatus() {
  const trpc = useTRPC();
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
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.leads.addNote.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.leads.get.queryKey() }),
  });
}
