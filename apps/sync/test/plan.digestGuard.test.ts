// T023 (Phase 3, INDEX, US1, [P]): assert Plan holds (not fails/throws uncaught) when a
// profiles[].sha256 in the manifest does not match the vendored packages/oracle-contract/
// oracle-views copy's recorded digest. Written first, shown failing (no handler exists yet).
// Uses the real published sample manifest CID (a test fixture value) and the handler's own
// `__testForceDigestMismatch` test hook (T008's own pattern) rather than crafting a tampered
// manifest file, since the digest comparison itself is the thing under test, not manifest
// parsing.
import { describe, expect, it } from "vitest";
import { planHandler } from "../handlers/plan.js";

const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";

describe("Plan: digest guard (ADR-07)", () => {
  it("holds, never throws uncaught, when the vendored profile digest does not match the manifest's", async () => {
    const result = await planHandler({
      manifestCidHint: SAMPLE_MANIFEST_CID,
      __testForceDigestMismatch: true,
    } as never);

    expect(result).toMatchObject({ status: "Held", heldReason: "digest_mismatch" });
  }, 30_000);

  it("does not hold on digest_mismatch for the real, untampered sample manifest", async () => {
    const result = await planHandler({ manifestCidHint: SAMPLE_MANIFEST_CID });

    expect(result).not.toMatchObject({ heldReason: "digest_mismatch" });
    expect(result).toHaveProperty("manifestCid", SAMPLE_MANIFEST_CID);
  }, 30_000);
});
