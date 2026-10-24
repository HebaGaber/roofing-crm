// B-07 T003 (data-model.md "Zod schemas"): lead shapes shared by apps/web and apps/api. The note
// text has no length cap here; the 4,000-char cap lives at the tRPC input boundary (T012).
import { z } from "zod";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export const LeadStatus = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const Lead = z.object({
  leadId: z.string().min(1),
  address: z.string(),
  lat: z.number(),
  lon: z.number(),
  status: LeadStatus,
  assignee: z.string().min(1),
  createdFrom: z.enum(["map", "list", "agent"]),
  sourceManifestCid: z.string().min(1),
  createdAt: z.string(),
  eventSequence: z.number().int().nonnegative(),
});
export type Lead = z.infer<typeof Lead>;

export const LeadSignals = z.object({
  roofAgeYears: z.number().optional(),
  roofAgeBasis: z.string().optional(),
  openPermitId: z.string().optional(),
  openDays: z.number().optional(),
  contractor: z.string().optional(),
  /** Only shown as a rating when bbb_status = rated (constitution P0-4); otherwise a missing reason. */
  bbbRating: z.string().optional(),
  capturedAt: z.string(),
});
export type LeadSignals = z.infer<typeof LeadSignals>;

export const LeadEvent = z.object({
  sequence: z.number().int().nonnegative(),
  at: z.string(),
  by: z.string().min(1),
  change: z.string(),
  kind: z.enum(["create", "statusChange", "note"]),
});
export type LeadEvent = z.infer<typeof LeadEvent>;

export const LeadFilters = z.object({
  roofAgeMinYears: z.number().nonnegative().optional(),
  permitStatus: z.enum(["open", "closed", "stalled"]).optional(),
  radiusMi: z.number().positive().optional(),
  centerLat: z.number().min(-90).max(90).optional(),
  centerLon: z.number().min(-180).max(180).optional(),
});
export type LeadFilters = z.infer<typeof LeadFilters>;
