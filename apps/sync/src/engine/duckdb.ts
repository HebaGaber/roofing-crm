// The only place in apps/sync that may import @duckdb/node-api (ARD § 4, AD-19 — "DuckDB is
// wired only in apps/*/src/engine/**", enforced by packages/eslint-config). BuildIndex talks to
// DuckDB through this thin wrapper rather than importing the driver directly.
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export type { DuckDBConnection };

/** Opens a fresh in-memory DuckDB connection, single-threaded (Lambda-sandbox sizing). */
export async function createInMemoryConnection(): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(":memory:", { threads: "1" });
  return instance.connect();
}
