// T029: FetchPart tries CloudFront first, falls back to Filebase then Pinata on failure (never
// ipfs.io/dweb.link), verifies every downloaded part's sha256 against the manifest before
// returning it, and routes to the DLQ after 5 exhausted retries rather than returning unverified
// bytes (contracts/sync-pipeline.md, ADR-02). T030 implements apps/sync/handlers/fetchPart.ts to
// make this pass — intentionally failing now (no handler exists yet).
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  GATEWAY_ORDER,
  MAX_RETRIES_BEFORE_SWITCH,
  type Gateway,
} from "@crm/config/gatewayPolicy.js";
import {
  contentAddressedKey,
  fetchPart,
  type FetchPartDeps,
  type GatewayFetcher,
  type S3ConditionalWriter,
} from "../handlers/fetchPart.js";

const MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const PART = {
  name: "v_property",
  path: "v_property/part-000.parquet",
  cid: "bafkreihexamplepartcid",
  sha256: createHash("sha256").update("real bytes").digest("hex"),
};

function noSleep() {
  return async () => undefined;
}

function alwaysFailingFetcher(name: Gateway): GatewayFetcher {
  return {
    name,
    fetch: vi.fn(async () => ({ ok: false, status: 503 })),
  };
}

function succeedingFetcher(name: Gateway, body: Buffer): GatewayFetcher {
  return {
    name,
    fetch: vi.fn(async () => ({ ok: true, status: 200, body })),
  };
}

function fakeS3Writer(): S3ConditionalWriter & { calls: string[] } {
  const written = new Set<string>();
  return {
    calls: [] as string[],
    async putIfAbsent(key, body) {
      this.calls.push(key);
      if (written.has(key)) return { written: false };
      written.add(key);
      void body;
      return { written: true };
    },
  };
}

function deps(fetchers: GatewayFetcher[], s3: S3ConditionalWriter): FetchPartDeps {
  return { fetchers, s3, sleep: noSleep(), random: () => 0 };
}

describe("FetchPart", () => {
  it("tries CloudFront first and returns verified bytes without falling back when it succeeds", async () => {
    const body = Buffer.from("real bytes");
    const cloudfront = succeedingFetcher("cloudfront", body);
    const filebase = alwaysFailingFetcher("filebase");
    const pinata = alwaysFailingFetcher("pinata");
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    expect(result).toMatchObject({ status: "verified", partPath: PART.path, sha256: PART.sha256 });
    expect(cloudfront.fetch).toHaveBeenCalledTimes(1);
    expect(filebase.fetch).not.toHaveBeenCalled();
    expect(pinata.fetch).not.toHaveBeenCalled();
  });

  it("falls back CloudFront -> Filebase -> Pinata on failure, never ipfs.io/dweb.link", async () => {
    const body = Buffer.from("real bytes");
    const cloudfront = alwaysFailingFetcher("cloudfront");
    const filebase = alwaysFailingFetcher("filebase");
    const pinata = succeedingFetcher("pinata", body);
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    expect(result.status).toBe("verified");
    expect(cloudfront.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(filebase.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(pinata.fetch).toHaveBeenCalledTimes(1);
    expect(GATEWAY_ORDER).toEqual(["cloudfront", "filebase", "pinata"]);
  });

  it("verifies every downloaded part's sha256 against the manifest before returning it", async () => {
    const wrongBody = Buffer.from("tampered bytes");
    const cloudfront = succeedingFetcher("cloudfront", wrongBody);
    const filebase = succeedingFetcher("filebase", wrongBody);
    const pinata = succeedingFetcher("pinata", wrongBody);
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    // A sha256 mismatch is never returned as verified bytes — it exhausts retries like any
    // other failure and ultimately routes to the DLQ.
    expect(result.status).toBe("dlq");
    expect(s3.calls).toHaveLength(0);
  });

  it("routes to the DLQ after all gateways' retries are exhausted, never returning unverified bytes", async () => {
    const cloudfront = alwaysFailingFetcher("cloudfront");
    const filebase = alwaysFailingFetcher("filebase");
    const pinata = alwaysFailingFetcher("pinata");
    const s3 = fakeS3Writer();

    const result = await fetchPart(
      { manifestCid: MANIFEST_CID, part: PART },
      deps([cloudfront, filebase, pinata], s3),
    );

    expect(result).toEqual({
      status: "dlq",
      partPath: PART.path,
      reason: "all_gateways_exhausted",
    });
    expect(cloudfront.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(filebase.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(pinata.fetch).toHaveBeenCalledTimes(MAX_RETRIES_BEFORE_SWITCH);
    expect(s3.calls).toHaveLength(0);
  });
});

describe("contentAddressedKey", () => {
  it("is sha256(manifestCid + partPath) — matches the idempotency key machamp's design uses", () => {
    const expected = createHash("sha256")
      .update(MANIFEST_CID + PART.path)
      .digest("hex");
    expect(contentAddressedKey(MANIFEST_CID, PART.path)).toBe(expected);
  });
});
