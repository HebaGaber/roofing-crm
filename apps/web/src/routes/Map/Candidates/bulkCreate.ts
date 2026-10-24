// Bulk "Create {n} leads" (E-54/E-75): one `leads.create` per selected property, at most
// `concurrency` in flight (≤ 2: the account's Lambda concurrency is 10 and the map, drawer and
// agent share it). The server's idempotent create refuses a second lead for the same property with
// ALREADY_EXISTS; those are counted as "already a lead", never as failures. Pure: the caller
// injects `create` and `isAlreadyExists`, so this is tested without a network.

export const MAX_BULK_CONCURRENCY = 2;

export interface BulkItem<I> {
  /** Stable id of the row (the property CID). */
  readonly id: string;
  readonly input: I;
}

export interface BulkOutcome<R> {
  readonly created: readonly { readonly id: string; readonly result: R }[];
  readonly already: readonly string[];
  readonly failed: readonly string[];
}

export async function runBulkCreate<I, R>(
  items: readonly BulkItem<I>[],
  create: (input: I) => Promise<R>,
  isAlreadyExists: (error: unknown) => boolean,
  concurrency: number = MAX_BULK_CONCURRENCY,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkOutcome<R>> {
  const limit = Math.max(1, Math.min(MAX_BULK_CONCURRENCY, Math.floor(concurrency)));
  const created: { id: string; result: R }[] = [];
  const already: string[] = [];
  const failed: string[] = [];
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next++];
      if (item === undefined) return;
      try {
        created.push({ id: item.id, result: await create(item.input) });
      } catch (error) {
        (isAlreadyExists(error) ? already : failed).push(item.id);
      }
      done += 1;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  // Report in the caller's order, not completion order.
  const order = new Map(items.map((item, i) => [item.id, i]));
  const byOrder = (a: string, b: string): number => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  created.sort((a, b) => byOrder(a.id, b.id));
  already.sort(byOrder);
  failed.sort(byOrder);
  return { created, already, failed };
}

/** "2 leads created · 1 already a lead" (CrmCandidatesCreated390), plus failures when any. */
export function bulkSummary(created: number, already: number, failed: number): string {
  const parts = [`${String(created)} ${created === 1 ? "lead" : "leads"} created`];
  if (already > 0) parts.push(`${String(already)} already ${already === 1 ? "a lead" : "leads"}`);
  if (failed > 0) parts.push(`${String(failed)} not saved`);
  return parts.join(" · ");
}
