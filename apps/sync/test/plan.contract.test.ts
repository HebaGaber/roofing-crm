// T008 (Phase 2 Foundational): the Plan step's output shape and digest-guard behavior, per
// contracts/sync-pipeline.md. T024 (Phase 3, espeon) implements apps/sync/handlers/plan.ts to
// make this pass — intentionally failing now (no handler exists yet).
import { describe, expect, it } from "vitest";
import { planHandler } from "../handlers/plan.js";

describe("Plan", () => {
  it("returns PlanResult's shape: manifestCid, profiles, costEstimate", async () => {
    const result = await planHandler({
      manifestCidHint: "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i",
    });
    expect(result).toMatchObject({
      manifestCid: expect.any(String),
      profiles: expect.any(Array),
      costEstimate: {
        predictedSpendUsd: expect.any(Number),
        predictedDocCount: expect.any(Number),
        predictedBytes: expect.any(Number),
      },
    });
  });

  it("holds (never throws uncaught) when a profiles[].sha256 mismatches the vendored copy's digest", async () => {
    const result = await planHandler({
      manifestCidHint: "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i",
      // Test-only override: force the manifest's recorded digest off the vendored copy's real one.
      __testForceDigestMismatch: true,
    } as never);
    expect(result.status).toBe("Held");
    expect(result.heldReason).toBe("digest_mismatch");
  });
});
