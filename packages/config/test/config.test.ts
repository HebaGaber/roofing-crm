import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.js";

const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";

describe("loadConfig", () => {
  it("resolves region from CDK_DEFAULT_REGION", () => {
    expect(
      loadConfig({ CDK_DEFAULT_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID });
  });

  it("falls back to AWS_REGION", () => {
    expect(
      loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID });
  });

  it("prefers CDK_DEFAULT_REGION over AWS_REGION", () => {
    expect(
      loadConfig({
        CDK_DEFAULT_REGION: "eu-north-1",
        AWS_REGION: "us-east-2",
        DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID,
      }),
    ).toEqual({ region: "eu-north-1", dataManifestCid: SAMPLE_MANIFEST_CID });
  });

  it("fails fast when no region is set", () => {
    expect(() => loadConfig({})).toThrow(/no region resolved/);
  });

  it("fails fast on a disallowed region (region-lock, CLAUDE.md)", () => {
    expect(() => loadConfig({ AWS_REGION: "us-east-2" })).toThrow(/not an allowed region/);
  });

  it("reads DATA_MANIFEST_CID from the environment, never a hard-coded constant", () => {
    expect(
      loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: SAMPLE_MANIFEST_CID }),
    ).toEqual({
      region: "eu-north-1",
      dataManifestCid: SAMPLE_MANIFEST_CID,
    });
  });

  it("fails fast when DATA_MANIFEST_CID is missing", () => {
    expect(() => loadConfig({ AWS_REGION: "eu-north-1" })).toThrow(/DATA_MANIFEST_CID/);
  });

  it("fails fast when DATA_MANIFEST_CID is not a CIDv1 string", () => {
    expect(() => loadConfig({ AWS_REGION: "eu-north-1", DATA_MANIFEST_CID: "not-a-cid" })).toThrow(
      /DATA_MANIFEST_CID/,
    );
  });
});
