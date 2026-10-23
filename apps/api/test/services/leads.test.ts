// T009: leadService calls the right leadRepo method per operation and surfaces its errors
// unchanged; the repo is injected, never imported by the service.
import { describe, expect, it, vi } from "vitest";
import type { LeadRepo } from "../../src/adapters/leadRepo.js";
import { createLeadService } from "../../src/services/leads.js";
import { LeadAlreadyExistsError } from "../../src/leadErrors.js";
import { KEY } from "../support/leadFixtures.js";

function fakeRepo(overrides: Partial<LeadRepo> = {}): LeadRepo {
  const lead = {
    leadKey: KEY,
    leadId: "L",
    address: "a",
    lat: 1,
    lon: 2,
    status: "new" as const,
    assignee: "rep-1",
    createdFrom: "map" as const,
    sourceManifestCid: "m1",
    createdAt: "t",
    eventSequence: 0,
  };
  return {
    create: vi.fn(async () => lead),
    updateStatus: vi.fn(async () => lead),
    addNote: vi.fn(async () => lead),
    get: vi.fn(async () => ({ lead, signals: undefined, events: [] })),
    listByAssignee: vi.fn(async () => [lead]),
    listByStatus: vi.fn(async () => [lead]),
    ...overrides,
  };
}
const NOW = new Date("2026-10-24T12:00:00.000Z");
const opts = { now: () => NOW, newId: () => "01JFIXEDID" };

describe("createLeadService (T009)", () => {
  it("create derives the key via leadKey(), sets assignee/createdAt/leadId, calls repo.create once", async () => {
    const repo = fakeRepo();
    const svc = createLeadService(repo, opts);
    await svc.create(
      {
        fips: "48453",
        requestIdentifier: "0208011301",
        address: "a",
        lat: 1,
        lon: 2,
        signals: {},
        sourceManifestCid: "m1",
        createdFrom: "map",
      },
      "rep-1",
    );
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        leadKey: KEY,
        leadId: "01JFIXEDID",
        assignee: "rep-1",
        createdAt: NOW.toISOString(),
      }),
    );
  });

  it("updateStatus / addNote / get / list delegate to the matching repo methods", async () => {
    const repo = fakeRepo();
    const svc = createLeadService(repo, opts);
    await svc.updateStatus(KEY, "contacted", "rep-1");
    await svc.addNote(KEY, "hi", "rep-1");
    await svc.get(KEY);
    await svc.list({ assignee: "rep-1" }, "rep-1");
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ leadKey: KEY, status: "contacted", by: "rep-1" }),
    );
    expect(repo.addNote).toHaveBeenCalledWith(
      expect.objectContaining({ leadKey: KEY, text: "hi" }),
    );
    expect(repo.get).toHaveBeenCalledWith(KEY);
    expect(repo.listByAssignee).toHaveBeenCalledWith("rep-1");
  });

  it("surfaces the repo's errors unchanged (same instance)", async () => {
    const boom = new LeadAlreadyExistsError(KEY);
    const svc = createLeadService(
      fakeRepo({
        create: vi.fn(async () => {
          throw boom;
        }),
      }),
      opts,
    );
    await expect(
      svc.create(
        {
          fips: "48453",
          requestIdentifier: "1",
          address: "a",
          lat: 1,
          lon: 2,
          signals: {},
          sourceManifestCid: "m",
          createdFrom: "map",
        },
        "r",
      ),
    ).rejects.toBe(boom);
  });
});
