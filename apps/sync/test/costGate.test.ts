// T035: Plan's cost-gate check (called from T024's plan.ts) holds the run when predicted spend
// exceeds $1.00, predicted doc count exceeds 600,000, or predicted bytes exceed 2 GB — sized from
// the manifest's own declared byte size, never a live network call (ADR-05; research.md's
// machamp refinement). T036 implements apps/sync/handlers/costGate.ts to make this pass —
// intentionally failing now (no module exists yet).
import { describe, expect, it, vi } from "vitest";
import {
  COST_GATE_THRESHOLDS,
  estimateCostFromManifest,
  evaluateCostGate,
  type CostEstimate,
} from "../handlers/costGate.js";

function manifestWithArtifactBytesAndCoverage(bytes: number, parcelsPublished: number) {
  return {
    schema: "oracle-travis-run-manifest.v1",
    runId: "run-1",
    county: "Travis",
    state: "TX",
    fips: "48453",
    startedAt: "2026-10-23T00:00:00Z",
    finishedAt: "2026-10-23T00:05:00Z",
    previousManifestCid: null,
    sources: [],
    artifacts: [
      {
        name: "v_property",
        cid: "bafkreiexample",
        codec: "parquet",
        size: bytes,
        sha256: "0".repeat(64),
        kind: "table" as const,
      },
    ],
    profiles: [],
    coverage: {
      parcels_published: { count: parcelsPublished, derivation: "published_rows" as const },
    },
    limitations: [],
  };
}

describe("estimateCostFromManifest", () => {
  it("sizes the estimate from the manifest's own declared artifact byte sizes, never a network call", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("costGate must never make a network call (ADR-05)");
    });
    const manifest = manifestWithArtifactBytesAndCoverage(1024, 35);

    const estimate = estimateCostFromManifest(manifest);

    expect(estimate.predictedBytes).toBe(1024);
    expect(estimate.predictedDocCount).toBe(35);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("evaluateCostGate", () => {
  const passing: CostEstimate = {
    predictedSpendUsd: 0.01,
    predictedDocCount: 35,
    predictedBytes: 4096,
  };

  it("passes (does not hold) well under every threshold", () => {
    expect(evaluateCostGate(passing)).toEqual({ held: false });
  });

  it("holds when predicted spend exceeds $1.00", () => {
    const estimate = { ...passing, predictedSpendUsd: COST_GATE_THRESHOLDS.maxSpendUsd + 0.01 };
    expect(evaluateCostGate(estimate)).toEqual({ held: true, heldReason: "cost_gate_exceeded" });
  });

  it("holds when predicted doc count exceeds 600,000", () => {
    const estimate = { ...passing, predictedDocCount: COST_GATE_THRESHOLDS.maxDocCount + 1 };
    expect(evaluateCostGate(estimate)).toEqual({ held: true, heldReason: "cost_gate_exceeded" });
  });

  it("holds when predicted bytes exceed 2 GB", () => {
    const estimate = { ...passing, predictedBytes: COST_GATE_THRESHOLDS.maxBytes + 1 };
    expect(evaluateCostGate(estimate)).toEqual({ held: true, heldReason: "cost_gate_exceeded" });
  });

  it("does not hold exactly at each threshold (strictly greater-than, not greater-or-equal)", () => {
    const estimate = {
      predictedSpendUsd: COST_GATE_THRESHOLDS.maxSpendUsd,
      predictedDocCount: COST_GATE_THRESHOLDS.maxDocCount,
      predictedBytes: COST_GATE_THRESHOLDS.maxBytes,
    };
    expect(evaluateCostGate(estimate)).toEqual({ held: false });
  });
});
