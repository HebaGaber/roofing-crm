// AgentAnswer: the agent's response shape (ADR-06 §4, docs/decisions/0000-agent-architecture.md;
// data-model.md "AgentAnswer (existing ADR shape)" — used verbatim, not the shorter outcome enum
// an earlier design consult sketched). Every claim must carry at least one citationId, and every
// citationId must resolve against this turn's own tool-call results before the answer leaves the
// server (services/agent/verifyCitations.ts, Phase 4) — a claim whose citation doesn't resolve is
// dropped before the answer is returned, never shown unverified. `counts` fields are always
// server-computed, never copied from model text.
import { z } from "zod";
import { QueryPlan } from "./queryPlan.js";

export const AgentAnswer = z.object({
  outcome: z.enum([
    "answered",
    "empty_in_scope",
    "out_of_scope",
    "not_found",
    "needs_clarification",
    "field_not_published",
    "timed_out",
    "rate_limited",
    "paused",
  ]),
  claims: z.array(
    z.object({
      text: z.string().max(400),
      citationIds: z.array(z.number().int()).min(1),
    }),
  ),
  citations: z.array(
    z.object({
      id: z.number().int(),
      kind: z.enum(["property", "permit", "run", "place"]),
      tcadId: z.string().optional(),
      propertyCid: z.string().optional(),
      permitCid: z.string().optional(),
      sourceUrl: z.string().nullable(),
      capturedAt: z.string(),
      tableCid: z.string(),
      manifestCid: z.string(),
      asOf: z.string(),
    }),
  ),
  plan: QueryPlan, // "How I read this"
  resultSetId: z.string(), // the UI pages the full rows from here, never from model text
  counts: z.object({
    matched: z.number(),
    shown: z.number(),
    excludedNoCoordinates: z.number(),
    excludedNoRoofDate: z.number(),
    truncated: z.boolean(),
  }),
  missing: z.array(z.object({ field: z.string(), reason: z.string() })),
  proposals: z
    .array(
      z.object({
        tcadId: z.string(),
        alreadyLead: z.boolean(),
        leadId: z.string().optional(),
      }),
    )
    .optional(),
  trace: z.object({
    traceId: z.string(),
    modelId: z.string(),
    promptVersion: z.string(),
    rankVersion: z.string(),
    toolSteps: z.number(),
    modelCalls: z.number(),
  }),
});
export type AgentAnswer = z.infer<typeof AgentAnswer>;
