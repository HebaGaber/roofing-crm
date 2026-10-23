# Phase 0 research: B-07 leads

No `NEEDS CLARIFICATION` remained in the plan's Technical Context — the design consults (`agent-design.md`) and Round 1 already resolved the open points. This file records the small number of implementation-detail decisions that followed from them.

## Decision: Zod schema package

- **Decision**: `Lead`, `LeadEvent`, `LeadSignals` Zod schemas live in `packages/shared/src/schemas/lead.ts`.
- **Rationale**: `packages/shared` is already the browser-safe, no-`node:`-import home for Zod schemas shared by `apps/web` and `apps/api` (see its existing `schemas/session.ts`, `schemas/roadmap-section.ts`). `packages/index-schema` is reserved for the reader/writer contract of the search index (`crm_property`/`crm_permit`), a different concern (architecture-constitution.md §9) — leads are not part of that index.
- **Alternatives considered**: `packages/index-schema` (rejected — wrong concern, would blur the reader/writer boundary the constitution protects).

## Decision: Conditional dedupe mechanism

- **Decision**: `TransactWriteItems` with `ConditionExpression: attribute_not_exists(pk)` on the `sk=LEAD` item, in the same transaction as the `SIGNALS` item and the first `EVT#0` item.
- **Rationale**: ADR-04 and P0-6 require a true DynamoDB transaction, never read-then-write. A single transaction also guarantees the lead, its snapshot and its first event are created atomically — no window where a lead exists without a snapshot. Confirmed by both `mew` and `metagross` (agent-design.md).
- **Alternatives considered**: Optimistic locking with a mutable `version` attribute (rejected — ADR-04 explicitly names this as the thing to avoid, since it reintroduces lost-update risk under 20 concurrent creates).

## Decision: Status/assignee projection update

- **Decision**: The `sk=LEAD` item's `status`/`assignee` fields are updated transactionally alongside each `EVT#{sequence}` append (not read separately and replayed on every read).
- **Rationale**: `metagross`'s answer allows either approach ("either is fine, not both independently"); updating in the same transaction as the event write is simpler to test for the 20-concurrent-create NFR (one code path, one transaction) than a separate replay step, and still satisfies "a projection replayed from events" since the event log remains the source of truth and the projection is derived from it at write time.
- **Alternatives considered**: Pure read-time replay of all `EVT#` items on every `leads.list`/`leads.get` call (rejected for this story — adds read latency and query complexity for no behavioral difference the ACs require; the event log is still authoritative and a future story could switch to full replay without changing the public contract).

## Decision: Roof-age/permit-status/radius filtering path

- **Decision**: `leads.list`'s roof-age/permit-status/radius filters are forwarded to the existing search index (DuckDB over Parquet, the `LeadIndex`/search port already built in B-02/B-03), not evaluated as a DynamoDB scan or filter expression.
- **Rationale**: These fields live on the property/permit record, not the lead item (the lead only stores a point-in-time `signals` snapshot copied from the index at creation). AC-4 requires the list and the map to agree on the filtered count — they must share one query path to guarantee that, per architecture-constitution.md §5 ("the map, the list and the agent never disagree"). DynamoDB only needs GSI1 (assignee) and GSI2 (status) for lookups that are genuinely lead-owned state.
- **Alternatives considered**: Store a denormalized copy of roof-age/permit-status on the lead item and scan DynamoDB (rejected — duplicates the index's data, can drift from a newer Task A run, and doesn't share a query path with the map).
