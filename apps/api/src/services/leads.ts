// B-07 Application layer (architecture-constitution.md §4/§9): orchestrates the injected
// `LeadRepo` and `LeadIndex` ports plus packages/domain's pure rules. `leadRepo` is a constructor
// argument, never imported or instantiated here. No business rule beyond orchestration lives in
// this file or in the router: the dedupe key comes from `leadKey()`, not-in-run (AC-5) from
// `isNotInCurrentRun()` plus an index presence check, and all duplicate/sequence enforcement is the repo's DynamoDB conditions.
import { randomBytes } from "node:crypto";
import { isNotInCurrentRun, leadKey, requestIdentifierOf } from "@crm/domain";
import type { LeadEvent, LeadFilters, LeadSignals, LeadStatus } from "@crm/shared";
import type { LeadIndex, SearchPropertiesQuery } from "../adapters/duckDbParquet.js";
import type { LeadRepo, StoredLead } from "../adapters/leadRepo.js";
import { LeadIndexUnavailableError } from "../leadErrors.js";

export interface CreateLeadInput {
  fips: string;
  requestIdentifier: string;
  address: string;
  lat: number;
  lon: number;
  signals: Omit<LeadSignals, "capturedAt">;
  sourceManifestCid: string;
  createdFrom: StoredLead["createdFrom"];
}

export interface ListLeadsInput {
  filters?: LeadFilters | undefined;
  assignee?: string | undefined;
  status?: LeadStatus | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export type LeadView = StoredLead & { notInCurrentRun: boolean };
export type LeadDetailView = LeadView & {
  /** Manifest CID of the run now served: the provenance shown beside "not in the current run".
   *  Undefined when no run is promoted. */
  currentManifestCid: string | undefined;
  /** Run identifier of the run now served; resolved only when the lead is flagged. */
  currentRunId: string | undefined;
  signals: LeadSignals | undefined;
  notes: LeadEvent[];
  history: LeadEvent[];
};

export interface LeadService {
  create(input: CreateLeadInput, by: string): Promise<StoredLead>;
  updateStatus(
    key: string,
    status: LeadStatus,
    by: string,
    expectedSequence?: number,
  ): Promise<StoredLead>;
  addNote(key: string, text: string, by: string, expectedSequence?: number): Promise<StoredLead>;
  get(key: string): Promise<LeadDetailView | null>;
  list(
    input: ListLeadsInput,
    by: string,
  ): Promise<{ leads: LeadView[]; nextCursor?: string; totalCount: number }>;
}

export interface LeadServiceOptions {
  readonly leadIndex?: LeadIndex;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID (data-model.md `leadId`): 48-bit ms timestamp + 80 random bits, Crockford base32. */
export function newUlid(nowMs: number = Date.now()): string {
  let time = "";
  for (let t = nowMs, i = 0; i < 10; i++, t = Math.floor(t / 32))
    time = (CROCKFORD[t % 32] ?? "") + time;
  const rand = randomBytes(16);
  let suffix = "";
  for (let i = 0; i < 16; i++) suffix += CROCKFORD[(rand[i] ?? 0) % 32] ?? "";
  return time + suffix;
}

const DEFAULT_LIMIT = 50;
/** The index search applies LIMIT 100 when no center+radius is given; a lead filter must see the
 *  whole index or it silently drops matching leads, so ask for effectively everything. */
const INDEX_SCAN_LIMIT = 1_000_000;

export function createLeadService(
  leadRepo: LeadRepo,
  options: LeadServiceOptions = {},
): LeadService {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => newUlid());
  const { leadIndex } = options;

  async function currentManifest(): Promise<string | undefined> {
    if (leadIndex === undefined) return undefined;
    try {
      return (await leadIndex.indexInfo()).manifestCid;
    } catch {
      return undefined; // no promoted run yet: staleness unknown, so never flagged
    }
  }
  const requestIdOf = (lead: StoredLead): string => requestIdentifierOf(lead.leadKey);

  /** AC-5: flagged only when the manifest differs AND the lead's property is absent from the
   *  current run. Only manifest-differing leads need the presence check, batched into one query;
   *  if it cannot run, nothing is flagged. Returns the flagged lead keys. */
  async function notInRunKeys(
    leads: readonly StoredLead[],
    current: string | undefined,
  ): Promise<Set<string>> {
    if (leadIndex === undefined || current === undefined) return new Set();
    const differing = leads.filter((l) => isNotInCurrentRun(l.sourceManifestCid, current));
    if (differing.length === 0) return new Set();
    try {
      const present = await leadIndex.presentRequestIdentifiers([
        ...new Set(differing.map(requestIdOf)),
      ]);
      return new Set(differing.filter((l) => !present.has(requestIdOf(l))).map((l) => l.leadKey));
    } catch {
      return new Set(); // presence unknown, so never flagged
    }
  }

  /** Request identifiers of properties matching the roof-age/permit/radius filters, resolved by
   *  the same LeadIndex calls the map's search.properties makes (AC-4). */
  async function matchingRequestIdentifiers(filters: LeadFilters): Promise<Set<string>> {
    if (leadIndex === undefined) throw new LeadIndexUnavailableError();
    const query: SearchPropertiesQuery = { limit: INDEX_SCAN_LIMIT };
    if (
      filters.radiusMi !== undefined &&
      filters.centerLat !== undefined &&
      filters.centerLon !== undefined
    ) {
      query.center = { lat: filters.centerLat, lng: filters.centerLon };
      query.radiusMi = filters.radiusMi;
    }
    if (filters.roofAgeMinYears !== undefined) query.roofAgeMinYears = filters.roofAgeMinYears;
    let properties = await leadIndex.searchProperties(query);
    if (filters.permitStatus !== undefined) {
      const permits = await leadIndex.searchPermits({
        propertyCids: properties.map((p) => p.propertyCid),
      });
      const withMatch = new Set(
        permits.filter((p) => p.statusClass === filters.permitStatus).map((p) => p.propertyCid),
      );
      properties = properties.filter((p) => withMatch.has(p.propertyCid));
    }
    return new Set(properties.map((p) => p.requestIdentifier));
  }

  return {
    create(input, by) {
      const at = now().toISOString();
      return leadRepo.create({
        leadKey: leadKey(input.fips, input.requestIdentifier),
        leadId: newId(),
        address: input.address,
        lat: input.lat,
        lon: input.lon,
        assignee: by,
        createdFrom: input.createdFrom,
        sourceManifestCid: input.sourceManifestCid,
        createdAt: at,
        signals: input.signals,
      });
    },

    updateStatus(key, status, by, expectedSequence) {
      return leadRepo.updateStatus({
        leadKey: key,
        status,
        by,
        at: now().toISOString(),
        ...(expectedSequence === undefined ? {} : { expectedSequence }),
      });
    },

    addNote(key, text, by, expectedSequence) {
      return leadRepo.addNote({
        leadKey: key,
        text,
        by,
        at: now().toISOString(),
        ...(expectedSequence === undefined ? {} : { expectedSequence }),
      });
    },

    async get(key) {
      const detail = await leadRepo.get(key);
      if (detail === null) return null;
      const current = await currentManifest();
      const notInCurrentRun = (await notInRunKeys([detail.lead], current)).size > 0;
      let currentRunId: string | undefined;
      if (notInCurrentRun && leadIndex !== undefined) {
        try {
          currentRunId = await leadIndex.currentRunId();
        } catch {
          currentRunId = undefined;
        }
      }
      return {
        ...detail.lead,
        notInCurrentRun,
        currentManifestCid: current,
        currentRunId,
        signals: detail.signals,
        notes: detail.events.filter((e) => e.kind === "note"),
        history: [...detail.events],
      };
    },

    async list(input, by) {
      const filters = input.filters ?? {};
      const geo =
        filters.roofAgeMinYears !== undefined ||
        filters.radiusMi !== undefined ||
        filters.permitStatus !== undefined;

      // The default scope is always the caller's own leads (GSI1); status filters in memory.
      let candidates = await leadRepo.listByAssignee(input.assignee ?? by);
      if (input.status !== undefined)
        candidates = candidates.filter((l) => l.status === input.status);

      if (geo) {
        const ids = await matchingRequestIdentifiers(filters);
        candidates = candidates.filter((l) => ids.has(requestIdOf(l)));
      }

      const current = await currentManifest();
      const offset = input.cursor === undefined ? 0 : Number.parseInt(input.cursor, 10);
      const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
      const limit = input.limit ?? DEFAULT_LIMIT;
      const page = candidates.slice(start, start + limit);
      const end = start + page.length;
      const flagged = await notInRunKeys(page, current);
      return {
        leads: page.map((l) => ({ ...l, notInCurrentRun: flagged.has(l.leadKey) })),
        ...(end < candidates.length ? { nextCursor: String(end) } : {}),
        totalCount: candidates.length,
      };
    },
  };
}
