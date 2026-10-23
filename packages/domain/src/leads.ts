// B-07 pure lead rules (data-model.md, architecture-constitution.md §5/§9). No I/O.

/** Dedupe key for a lead: `{fips}:tcad:{request_identifier}`. Never `property_cid` (ADR-04, P0-6). */
export function leadKey(fips: string, requestIdentifier: string): string {
  if (fips === "" || requestIdentifier === "") {
    throw new Error("leadKey requires a non-empty fips and request identifier");
  }
  return `${fips}:tcad:${requestIdentifier}`;
}

/** True when a lead was captured under a different manifest than the one currently served
 *  (AC-5: computed at read time, never stored). */
export function isNotInCurrentRun(sourceManifestCid: string, currentManifestCid: string): boolean {
  return sourceManifestCid !== currentManifestCid;
}
