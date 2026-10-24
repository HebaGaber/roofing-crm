// The only place the Candidate list and Field triage touch the tRPC client. They read the SAME
// `search.properties` / `search.permits` queries the map makes (identical inputs, so React Query
// shares one cache entry and switching Map ↔ List ↔ Triage costs no extra call), plus the
// caller's own leads for the "Lead · {status}" mark (E-52). Components call these hooks; tests
// mock this module.
import type { ApiInputs, ApiOutputs } from "@crm/api-client";
import { useTRPC, useTRPCClient } from "@crm/api-client/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { isAlreadyExists, toCreateInput } from "../../Leads/LeadCreateAction.js";
import { runBulkCreate, type BulkOutcome } from "./bulkCreate.js";
import {
  buildCandidates,
  leadsByRequestIdentifier,
  type Candidate,
  type CandidateFilters,
} from "./candidates.js";

export type CreatedLead = ApiOutputs["leads"]["create"];
export type LeadCreateInput = ApiInputs["leads"]["create"];
export type CreatedFrom = LeadCreateInput["createdFrom"];
export type PropertyDetailOutput = ApiOutputs["property"]["get"];

/** `leads.list` page size cap (the router's LIST_MAX_LIMIT). */
export const LEAD_PRESENCE_LIMIT = 100;

export type CandidatesStatus = "idle" | "loading" | "error" | "ready";

export interface CandidatesResult {
  readonly status: CandidatesStatus;
  /** Joined, unsorted candidates (empty until ready). */
  readonly candidates: readonly Candidate[];
  /** Properties in the ring before the permit filter (the header's "{n} within …"). */
  readonly totalInRing: number;
  /** search.permits failed: rows still show, without permit signals (partial). */
  readonly permitsUnavailable: boolean;
  /** leads.list failed: no lead marks; create still refuses duplicates server-side. */
  readonly leadsUnavailable: boolean;
  readonly refetch: () => void;
}

export function useCandidates(filters: CandidateFilters): CandidatesResult {
  const trpc = useTRPC();
  const { center, radiusMi, roofAgeMinYears } = filters;
  // Exactly the map's input shape (Map.tsx `searchInput`), so the cache entry is shared.
  const properties = useQuery({
    ...trpc.search.properties.queryOptions(
      center === null
        ? { center: { lat: 0, lng: 0 }, radiusMi }
        : { center, radiusMi, roofAgeMinYears },
    ),
    enabled: center !== null,
  });
  const permits = useQuery({
    ...trpc.search.permits.queryOptions({
      center: center ?? { lat: 0, lng: 0 },
      radiusMi,
      sort: "openDays" as const,
    }),
    enabled: center !== null,
  });
  const leads = useQuery(trpc.leads.list.queryOptions({ limit: LEAD_PRESENCE_LIMIT }));

  const candidates = useMemo(() => {
    if (properties.data === undefined) return [];
    const presence = leadsByRequestIdentifier(leads.data?.leads ?? []);
    return buildCandidates(
      properties.data.properties,
      permits.data?.permits ?? [],
      presence,
      filters,
    );
  }, [properties.data, permits.data, leads.data, filters]);

  const refetch = useCallback(() => {
    void properties.refetch();
    void permits.refetch();
    void leads.refetch();
  }, [properties, permits, leads]);

  let status: CandidatesStatus = "ready";
  if (center === null) status = "idle";
  else if (properties.isError) status = "error";
  // Wait for permits too when a permit filter narrows the list, or the rows would jump.
  else if (properties.isPending || (permits.isPending && !permits.isError)) status = "loading";

  return {
    status,
    candidates,
    totalInRing: properties.data?.properties.length ?? 0,
    permitsUnavailable: permits.isError,
    leadsUnavailable: leads.isError,
    refetch,
  };
}

/** One property's detail (`property.get`): BBB state and "near {place}" for the triage card.
 *  Same query key as the map's drawer, so opening details after a card costs no extra call. */
export function usePropertyDetail(propertyCid: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.property.get.queryOptions({ propertyCid: propertyCid ?? "" }),
    enabled: propertyCid !== null,
  });
}

/** The `leads.create` input for a candidate, with its origin (List or Map); null without a
 *  published location (the server needs lat/lon). */
export function candidateCreateInput(
  candidate: Candidate,
  createdFrom: CreatedFrom,
): LeadCreateInput | null {
  const input = toCreateInput(
    candidate.property,
    candidate.permits,
    candidate.mainPermit ?? undefined,
  );
  return input === null ? null : { ...input, createdFrom };
}

export { isAlreadyExists };

/** One-tap create (triage). Refreshes lead presence once it settles. */
export function useCreateCandidateLead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation({
    ...trpc.leads.create.mutationOptions(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.leads.list.queryKey() }),
  });
}

export interface BulkState {
  readonly running: boolean;
  readonly done: number;
  readonly total: number;
}

/** Bulk create with bounded concurrency; lead presence is refreshed once, at the end. */
export function useBulkCreateLeads() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<BulkState>({ running: false, done: 0, total: 0 });

  const run = useCallback(
    async (
      items: readonly { id: string; input: LeadCreateInput }[],
    ): Promise<BulkOutcome<CreatedLead>> => {
      setState({ running: true, done: 0, total: items.length });
      try {
        return await runBulkCreate(
          items,
          (input) => client.leads.create.mutate(input),
          isAlreadyExists,
          undefined,
          (done, total) => setState({ running: true, done, total }),
        );
      } finally {
        setState((s) => ({ ...s, running: false }));
        await queryClient.invalidateQueries({ queryKey: trpc.leads.list.queryKey() });
      }
    },
    [client, queryClient, trpc],
  );
  return { run, state };
}
