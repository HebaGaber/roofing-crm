// The one rule for "the permit a lead is about": among a property's permits, the open or stalled
// one open longest. The agent path (apps/api routers/agent.ts) uses it to save a lead's permit
// signals; the map's why-this-lead and the Candidate list state the same rule.

export interface LeadPermitLike {
  readonly statusClass?: string | null | undefined;
  readonly openDays?: number | null | undefined;
}

/** The `statusClass` values that count as a live permit: a stalled permit is an open one that is
 *  not progressing, so "open" always includes it. */
export const LIVE_PERMIT_STATUS_CLASSES = ["open", "stalled"] as const;

/** The permit-status filter chips (Open, Stalled, Any) as the `statusClass` values to send:
 *  Open = open or stalled, Stalled = stalled only, Any = no filter (undefined). */
export function permitStatusClassesFor(
  status: "open" | "stalled" | "any" | undefined,
): ("open" | "stalled")[] | undefined {
  if (status === "open") return [...LIVE_PERMIT_STATUS_CLASSES];
  if (status === "stalled") return ["stalled"];
  return undefined;
}

/** An open or stalled permit; a closed one, or one with no status, is not a live signal. */
export function isLivePermit(permit: LeadPermitLike): boolean {
  return permit.statusClass === "open" || permit.statusClass === "stalled";
}

/** The open or stalled permit open longest (no published `openDays` ranks last), else null. The
 *  first of equal candidates wins, so the result does not depend on a sort's stability. */
export function mainLeadPermit<T extends LeadPermitLike>(
  permits: readonly T[] | undefined,
): T | null {
  let best: T | null = null;
  for (const permit of permits ?? []) {
    if (!isLivePermit(permit)) continue;
    if (best === null || (permit.openDays ?? -1) > (best.openDays ?? -1)) best = permit;
  }
  return best;
}
