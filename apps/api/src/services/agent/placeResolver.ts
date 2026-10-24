// T030 (B-09, Phase 4/US1): the `PlaceResolver` port (packages/shared/src/rag/ports.ts)
// implemented over the vendored `travis-places@1.0.0` gazetteer (ADR-06 §5/§10 pattern #3,
// docs/decisions/0000-agent-architecture.md). Pipeline: normalise -> exact/alias (the gazetteer's
// own `lookup()`, score 1.0) -> ZIP (also `lookup()`, score 1.0 or `out_of_scope`) -> Jaro-Winkler
// fuzzy over every known Travis place name, best three candidates.
//
// This module returns candidates + scores only; it does NOT decide auto/clarify/refuse —
// `packages/shared/src/agent/thresholds.ts`'s `classifyPlaceConfidence` makes that call from the
// candidates this returns (ports.ts's own docstring on `PlaceResolution`), using the top
// candidate's score and its margin over the runner-up.
import { gazetteer } from "@crm/oracle-views";
import type { PlaceCandidate, PlaceResolution, PlaceResolver } from "@crm/shared";

const GAZETTEER_SOURCE = "travis-places@1.0.0";
const TOP_N = 3;

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Jaro similarity (Winkler's own 1990 definition): an approximate-string-match score in [0, 1],
 *  1 meaning identical. Implemented directly (no dependency) — it is a short, well-known,
 *  independently testable algorithm, in line with the engineering guidelines' preference against
 *  pulling in a package for something this self-contained. */
function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.floor(Math.max(aLen, bLen) / 2) - 1;
  const aMatched = new Array<boolean>(aLen).fill(false);
  const bMatched = new Array<boolean>(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let bIndex = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[bIndex]) bIndex++;
    if (a[i] !== b[bIndex]) transpositions++;
    bIndex++;
  }

  return (matches / aLen + matches / bLen + (matches - transpositions / 2) / matches) / 3;
}

const WINKLER_PREFIX_SCALE = 0.1;
const WINKLER_MAX_PREFIX = 4;

/** Jaro-Winkler: boosts the Jaro score for a shared leading prefix (the standard typo-tolerance
 *  refinement over plain Jaro, named explicitly by ADR-06 §5/§10 pattern #3). */
function jaroWinkler(a: string, b: string): number {
  const jaro = jaroSimilarity(a, b);
  const max = Math.min(WINKLER_MAX_PREFIX, a.length, b.length);
  let prefix = 0;
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * WINKLER_PREFIX_SCALE * (1 - jaro);
}

export interface RankedCandidate {
  readonly name: string;
  readonly score: number;
}

/** Pure ranking step, deliberately decoupled from the gazetteer so it is testable with any
 *  candidate list — T024's "two close candidates trigger the margin<0.05 clarify band" case does
 *  not depend on there happening to be two near-duplicate real Travis place names. Best-first. */
export function rankCandidates(query: string, names: readonly string[]): RankedCandidate[] {
  const q = normalise(query);
  return names
    .map((name) => ({ name, score: jaroWinkler(q, normalise(name)) }))
    .sort((a, b) => b.score - a.score);
}

function placeCandidate(
  name: string,
  score: number,
  match: PlaceCandidate["match"],
): PlaceCandidate | undefined {
  const found = gazetteer.lookup(name);
  if (found.status !== "found") return undefined;
  return { name: found.name, lat: found.point.lat, lon: found.point.lon, match, score };
}

const ZIP_SHAPED = /^(?:zip\s*)?\d{5}$/i;

export function createPlaceResolver(): PlaceResolver {
  return {
    async resolve(text: string): Promise<PlaceResolution> {
      const found = gazetteer.lookup(text);

      if (found.status === "found" && found.kind === "zcta") {
        const candidate: PlaceCandidate = {
          name: found.name,
          lat: found.point.lat,
          lon: found.point.lon,
          match: "zip",
          score: 1,
        };
        return { status: "resolved", candidates: [candidate], source: GAZETTEER_SOURCE };
      }

      if (found.status === "found") {
        // lookup() accepts the bare name (case-insensitive) or the name + LSAD suffix form
        // interchangeably — both are the gazetteer's own canonical match, scored 1.0 (ADR-06 §5:
        // "exact or alias = 1.0"). "alias" is reserved for a *learned* alias from the review loop
        // (ports.ts's `AliasRecord`, ADR §7) — not built this round — so every direct gazetteer
        // hit here is labelled "exact".
        const primary: PlaceCandidate = {
          name: found.name,
          lat: found.point.lat,
          lon: found.point.lon,
          match: "exact",
          score: 1,
        };
        const runnersUp = rankCandidates(text, gazetteer.listPlaceNames())
          .filter((c) => normalise(c.name) !== normalise(found.name))
          .slice(0, TOP_N - 1)
          .map((c) => placeCandidate(c.name, c.score, "fuzzy"))
          .filter((c): c is PlaceCandidate => c !== undefined);
        return {
          status: "resolved",
          candidates: [primary, ...runnersUp],
          source: GAZETTEER_SOURCE,
        };
      }

      // ZIP-shaped but not a Travis ZCTA (lookup() already checked): a known-outside-scope code,
      // never fuzzy-matched as if it were a place name.
      if (ZIP_SHAPED.test(normalise(text))) {
        return { status: "out_of_scope", candidates: [], source: GAZETTEER_SOURCE };
      }

      // Free text with no exact/alias/ZIP hit: rank every known Travis place name by fuzzy score.
      const ranked = rankCandidates(text, gazetteer.listPlaceNames()).slice(0, TOP_N);
      const candidates = ranked
        .map((r) => placeCandidate(r.name, r.score, "fuzzy"))
        .filter((c): c is PlaceCandidate => c !== undefined);
      return { status: "resolved", candidates, source: GAZETTEER_SOURCE };
    },
  };
}
