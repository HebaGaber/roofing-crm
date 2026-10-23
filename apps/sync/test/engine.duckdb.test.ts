// Covers the thin DuckDB connection wrapper (apps/sync/src/engine/duckdb.ts) — the one place in
// apps/sync allowed to import @duckdb/node-api directly (ARD § 4, AD-19). It had zero test
// coverage: nothing proved it actually opens a usable, single-threaded, in-memory connection.
import { describe, expect, it } from "vitest";
import { createInMemoryConnection } from "../src/engine/duckdb.js";

describe("createInMemoryConnection", () => {
  it("opens a fresh in-memory DuckDB connection that can run a query and read rows back", async () => {
    const connection = await createInMemoryConnection();
    try {
      const reader = await connection.runAndReadAll("SELECT 1 AS one, 'x' AS letter");
      const rows = reader.getRowObjectsJS();
      expect(rows).toEqual([{ one: 1, letter: "x" }]);
    } finally {
      connection.closeSync();
    }
  });

  it("is single-threaded (Lambda-sandbox sizing) — threads is pinned to 1", async () => {
    const connection = await createInMemoryConnection();
    try {
      const reader = await connection.runAndReadAll("SELECT current_setting('threads') AS threads");
      const rows = reader.getRowObjectsJS() as { threads: string | number }[];
      expect(String(rows[0]?.threads)).toBe("1");
    } finally {
      connection.closeSync();
    }
  });

  it("returns an independent connection each call (state from one does not leak into another)", async () => {
    const first = await createInMemoryConnection();
    const second = await createInMemoryConnection();
    try {
      await first.run("CREATE TABLE only_in_first (x INTEGER)");
      await expect(second.runAndReadAll("SELECT * FROM only_in_first")).rejects.toThrow();
    } finally {
      first.closeSync();
      second.closeSync();
    }
  });
});
