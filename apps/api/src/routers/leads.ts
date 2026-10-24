// B-07 `leads` router (contracts/leads.md). Entry layer only: Zod-parse input, call the injected
// `leadService`, map typed errors to tRPC codes. No business rule inline. Every procedure is
// wrapped in Powertools Logger/Tracer/Metrics (constitution §8/XIII). Logs carry the procedure
// name, request id and outcome only: never addresses, note text, assignee or owner names (P0-13).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LeadFilters, LeadStatus } from "@crm/shared";
import { createObservability, METRIC_NAMES } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { publicProcedure, requireLeadService, requireUserId, router } from "../trpc.js";
import {
  LeadAlreadyExistsError,
  LeadIndexUnavailableError,
  LeadNotFoundError,
  LeadSequenceConflictError,
} from "../leadErrors.js";

const obs = createObservability("crm-api");

const NOTE_MAX_CHARS = 4000; // constitution §6 validation boundary
const LIST_MAX_LIMIT = 100;

const CreateLeadInput = z.object({
  fips: z.string().min(1),
  requestIdentifier: z.string().min(1),
  address: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  signals: z.object({
    roofAgeYears: z.number().optional(),
    roofAgeBasis: z.string().optional(),
    openPermitId: z.string().optional(),
    openDays: z.number().optional(),
    contractor: z.string().optional(),
    bbbRating: z.string().optional(),
  }),
  sourceManifestCid: z.string().min(1),
  createdFrom: z.enum(["map", "list", "agent"]),
});

const LeadKeyInput = z.object({ leadKey: z.string().min(1) });
const SequenceInput = z.object({ expectedSequence: z.number().int().nonnegative().optional() });

const ListInput = z.object({
  filters: LeadFilters.refine(
    (f) => f.radiusMi === undefined || (f.centerLat !== undefined && f.centerLon !== undefined),
    { message: "radiusMi requires centerLat and centerLon" },
  )
    .refine(
      (f) =>
        (f.radiusMi === undefined) === (f.centerLat === undefined) &&
        (f.centerLat === undefined) === (f.centerLon === undefined),
      { message: "radiusMi, centerLat and centerLon must be given together or not at all" },
    )
    .optional(),
  assignee: z.string().min(1).optional(),
  status: LeadStatus.optional(),
  cursor: z.string().max(32).optional(),
  limit: z.number().int().positive().max(LIST_MAX_LIMIT).optional(),
});

function causeWithCode(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Typed lead errors -> tRPC errors; anything unrecognised is returned unchanged. */
function toTrpcError(error: unknown): unknown {
  if (error instanceof TRPCError) return error;
  if (error instanceof LeadAlreadyExistsError) {
    return new TRPCError({
      code: "CONFLICT",
      message: "Already a lead",
      cause: causeWithCode("ALREADY_EXISTS", error.message),
    });
  }
  if (error instanceof LeadSequenceConflictError) {
    return new TRPCError({
      code: "CONFLICT",
      message: "This lead changed since you loaded it; reload and retry",
      cause: causeWithCode("STALE_SEQUENCE", error.message),
    });
  }
  if (error instanceof LeadNotFoundError) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message, cause: error });
  }
  if (error instanceof LeadIndexUnavailableError) {
    return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error.message, cause: error });
  }
  return error;
}

/** Wraps one procedure body with the trace subsegment, a structured log line and a metric. */
async function observed<T>(
  procedure: string,
  requestId: string,
  metric: string,
  body: () => Promise<T>,
): Promise<T> {
  const subsegment = obs.tracer.getSegment()?.addNewSubsegment(`## leads.${procedure}`);
  try {
    const result = await body();
    obs.logger.info("leads procedure ok", { procedure, requestId });
    obs.metrics.addMetric(metric, MetricUnit.Count, 1);
    return result;
  } catch (error) {
    const mapped = toTrpcError(error);
    const code = mapped instanceof TRPCError ? mapped.code : "INTERNAL_SERVER_ERROR";
    // Expected domain outcomes (duplicate, stale, not found) are info; only unexpected is error.
    const unexpected = !(mapped instanceof TRPCError) || code === "INTERNAL_SERVER_ERROR";
    obs.logger[unexpected ? "error" : "info"]("leads procedure failed", {
      procedure,
      requestId,
      code,
    });
    if (unexpected) obs.metrics.addMetric(METRIC_NAMES.LeadsErrors, MetricUnit.Count, 1);
    throw mapped;
  } finally {
    subsegment?.close();
    obs.metrics.publishStoredMetrics();
  }
}

export const leadsRouter = router({
  create: publicProcedure
    .input(CreateLeadInput)
    .mutation(({ input, ctx }) =>
      observed("create", ctx.requestId, METRIC_NAMES.LeadsCreated, () =>
        requireLeadService(ctx).create(input, requireUserId(ctx)),
      ),
    ),

  updateStatus: publicProcedure
    .input(LeadKeyInput.extend({ status: LeadStatus }).merge(SequenceInput))
    .mutation(({ input, ctx }) =>
      observed("updateStatus", ctx.requestId, METRIC_NAMES.LeadsStatusUpdated, () =>
        requireLeadService(ctx).updateStatus(
          input.leadKey,
          input.status,
          requireUserId(ctx),
          input.expectedSequence,
        ),
      ),
    ),

  addNote: publicProcedure
    .input(
      LeadKeyInput.extend({ text: z.string().trim().min(1).max(NOTE_MAX_CHARS) }).merge(
        SequenceInput,
      ),
    )
    .mutation(({ input, ctx }) =>
      observed("addNote", ctx.requestId, METRIC_NAMES.LeadsNoteAdded, () =>
        requireLeadService(ctx).addNote(
          input.leadKey,
          input.text,
          requireUserId(ctx),
          input.expectedSequence,
        ),
      ),
    ),

  get: publicProcedure.input(LeadKeyInput).query(({ input, ctx }) =>
    observed("get", ctx.requestId, METRIC_NAMES.LeadsRead, async () => {
      const detail = await requireLeadService(ctx).get(input.leadKey);
      if (detail === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No lead exists for ${input.leadKey}` });
      }
      return detail;
    }),
  ),

  list: publicProcedure
    .input(ListInput)
    .query(({ input, ctx }) =>
      observed("list", ctx.requestId, METRIC_NAMES.LeadsListed, () =>
        requireLeadService(ctx).list(input, requireUserId(ctx)),
      ),
    ),
});
