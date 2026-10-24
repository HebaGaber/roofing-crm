// T031 (B-09, Phase 4/US1): the server-side citation verifier (ADR-06 §4/§5,
// docs/decisions/0000-agent-architecture.md). Every `claims[].citationIds` entry must resolve
// against (a) this turn's own tool-result set — the model cannot cite a citation id it was never
// handed — and (b) a batch `leadIndex.getProperty` call for the current `manifestCid`, so a
// property citation that is merely tool-result-shaped but no longer (or never) really in the live
// index is still caught. A claim failing either check is dropped before the answer leaves the
// server, never shown unverified (constitution XI, data honesty); when no claim survives, a
// deterministic template built from the server-computed `counts` (never from model text) stands
// in for the answer instead.
import type { AgentAnswer } from "@crm/shared";
import type { LeadIndex } from "../../adapters/duckDbParquet.js";

type Claim = AgentAnswer["claims"][number];
type Citation = AgentAnswer["citations"][number];
type Counts = AgentAnswer["counts"];

export interface VerifyCitationsInput {
  readonly claims: readonly Claim[];
  readonly citations: readonly Citation[];
  /** Citation ids this turn's tool calls actually produced — not every id in `citations` need
   *  have come from a tool call; only these may ever be cited. */
  readonly toolResultCitationIds: ReadonlySet<number>;
  readonly leadIndex: LeadIndex;
  readonly manifestCid: string;
  /** Used only to build the fallback template when every claim is stripped; never copied from
   *  model text into the kept claims themselves. */
  readonly counts: Counts;
}

export interface VerifyCitationsResult {
  readonly claims: Claim[];
  /** How many of the input claims were dropped (metric `CitationDropped`, ADR §10 pattern #10). */
  readonly droppedCount: number;
  /** True when the returned `claims` is the deterministic fallback template, not model text. */
  readonly usedTemplate: boolean;
}

/** One verified-citations-only sentence built from server-computed counts — no model call, no
 *  model text. Returns no claims (so the caller can fall through to `empty_in_scope`/similar
 *  instead) when there is nothing verified left to cite. */
function templateClaims(counts: Counts, verifiedCitationIds: readonly number[]): Claim[] {
  if (verifiedCitationIds.length === 0) return [];
  const text = `Found ${counts.matched} matching record${counts.matched === 1 ? "" : "s"}; showing ${counts.shown}.`;
  return [{ text, citationIds: [...verifiedCitationIds] }];
}

export async function verifyCitations(input: VerifyCitationsInput): Promise<VerifyCitationsResult> {
  const { claims, citations, toolResultCitationIds, leadIndex, manifestCid, counts } = input;
  const byId = new Map(citations.map((c) => [c.id, c]));

  // Batch-verify every distinct property citation against the live index once (not once per
  // claim, and not once per repeated citationId).
  const propertyCids = [
    ...new Set(
      citations
        .filter((c) => c.kind === "property" && c.propertyCid !== undefined)
        .map((c) => c.propertyCid as string),
    ),
  ];
  const verifiedPropertyCids = new Set<string>();
  await Promise.all(
    propertyCids.map(async (cid) => {
      const found = await leadIndex.getProperty(cid);
      if (found !== null && found.sourceManifestCid === manifestCid) verifiedPropertyCids.add(cid);
    }),
  );

  function citationResolves(id: number): boolean {
    if (!toolResultCitationIds.has(id)) return false;
    const citation = byId.get(id);
    if (citation === undefined) return false;
    if (citation.kind === "property") {
      return citation.propertyCid !== undefined && verifiedPropertyCids.has(citation.propertyCid);
    }
    // permit/run/place citations rely on tool-result membership alone — there is no equivalent
    // single-item LeadIndex lookup for them in this round (contracts/agent-api.md's tool table).
    return true;
  }

  const kept: Claim[] = [];
  let droppedCount = 0;
  for (const claim of claims) {
    if (claim.citationIds.length > 0 && claim.citationIds.every(citationResolves)) {
      kept.push(claim);
    } else {
      droppedCount++;
    }
  }

  if (kept.length > 0) {
    return { claims: kept, droppedCount, usedTemplate: false };
  }

  // Nothing survived verification: fall back to a deterministic, counts-based template built
  // only from citations that themselves passed verification (never from the stripped claims'
  // text) — if even that is empty, the caller has no citable evidence at all and should choose a
  // non-"answered" outcome (empty_in_scope, etc.) rather than call this template "answered".
  const verifiedCitationIds = citations
    .filter((c) => toolResultCitationIds.has(c.id))
    .filter((c) => (c.kind === "property" ? verifiedPropertyCids.has(c.propertyCid ?? "") : true))
    .map((c) => c.id);

  return {
    claims: templateClaims(counts, verifiedCitationIds),
    droppedCount,
    usedTemplate: true,
  };
}
