# tRPC contract: `agent` router

All procedures sit behind the Cognito JWT authorizer (constitution §12 P0-11), same as `leads`/`search`.
Zod shapes for `QueryPlan`/`AgentAnswer` are ADR-06 (`docs/decisions/0000-agent-architecture.md` §4);
this contract only adds the tRPC-boundary shapes and behavior, per `agent-design.md`.

## `agent.ask`

**Input**
```ts
{
  question: string;          // 1-500 chars, trimmed
  threadId: string;          // client-generated, identifies the conversation for ConversationEventStore
}
```

**Behavior**:
1. Budget check first, before any model call: `crm-agent-usage` conditional `UpdateItem` for the
   5/min window and the $3/day estimated-cost cap. Over either → return without calling the model.
2. Load the thread's last `QueryPlan` from `ConversationEventStore` (DynamoDB), if any (area/filter
   inheritance, G2).
3. Plan step (model call 1): draft a `QueryPlan`, Zod-validated, one repair retry on invalid JSON.
4. Scope + place-resolution check against ADR-06's bands (research.md "Decision: confidence
   bands... verbatim"): `out_of_scope` / `not_found` / `needs_clarification` short-circuit here,
   no further tool calls, no compose call — a fixed/templated answer.
5. Tool calls: `resolvePlace`, `searchProperties`/`searchPermits`, `getProperty` as the plan needs,
   via the existing `LeadIndex` port over the pinned manifest CID (AC-7).
6. Compose step (model call 2, at most): claims from ≤25 compact rows + server-computed counts.
7. Server citation verifier (no model call): every `citationIds` entry must resolve against this
   turn's own tool results; a failing claim is dropped; if none remain, a deterministic template
   answer from counts/top rows is returned instead.
8. Append the turn to `ConversationEventStore`; emit metrics (`AgentAsksTotal`,
   `AgentAnswerLatencyMs`, `AgentCitationsTotal`/`Verified`, `AgentModelCallsTotal`).
9. 23s `AbortSignal` wraps the whole procedure; on abort, return `{outcome: "timed_out"}`, never an
   unhandled 500 (same `mapIndexNotReady`-style typed-error pattern as `search.ts`).

**Output**: `AgentAnswer` (ADR-06 §4 shape) — `outcome`, `claims[]`, `citations[]`, `plan`,
`resultSetId`, `counts`, `missing[]`, `proposals[]?`, `trace`.

**Errors**: rate/spend cap exceeded → `TRPCError TOO_MANY_REQUESTS`, `appCode: "RATE_LIMITED"`
(`outcome: "rate_limited"`) or `appCode: "OVER_BUDGET"` (`outcome: "paused"`) — mapped the same way
`leads.ts`'s `toTrpcError` maps `ALREADY_EXISTS`/`STALE_SEQUENCE`. Index not ready → same
`mapIndexNotReady` → `SERVICE_UNAVAILABLE` pattern as `search.ts`/`property.ts`.

## `agent.confirmLead`

**Input**
```ts
{
  threadId: string;
  tcadId: string;             // from a proposal in a prior AgentAnswer.proposals[]
}
```

**Behavior**: **Not model-invoked** — this is a plain tRPC mutation the UI calls after the rep taps
"Create" on the confirmation card (ADR §6.2 G7). Calls
`requireLeadService(ctx).create(input, requireUserId(ctx))` — the exact same application-layer
call `leads.create` already uses, with `createdFrom: "agent"` and `sourceManifestCid` set to the
pinned Run-2 CID. This is the whole mechanism behind FR-002/AC-2/constitution P0: the model's tool
set (`proposeLeads`) never includes anything that reaches `LeadService.create` — only this
separate, rep-triggered mutation does. A grep of `apps/api/src/services/agent/tools.ts` for any
`LeadService`/`requireLeadService` import must come back empty; it is only ever imported by this
router handler.

**Output**: `Lead` (same shape `leads.create` returns).

**Errors**: `ALREADY_EXISTS` (the property is already a lead) is a valid outcome, not a failure —
same mapping as `leads.create`.

## Tools exposed to the model (not tRPC procedures; invoked inside `agent.ask`'s tool loop)

Per ADR-06 §6.2, unchanged this round except data source (AC-7):

| Tool | Input | Returns to model | Writes? |
| --- | --- | --- | --- |
| `resolvePlace` | `{text}` | name, point, match kind, score, top 3 | no |
| `searchProperties` | `QueryPlan.area` + `filters` | counts, excluded counts, ≤25 compact rows | no |
| `searchPermits` | the same + `statusClass`, `openYearsMin` | the same, sorted by `open_days` desc | no |
| `getProperty` | `{tcadId}` or `{propertyCid}` | one property + its permits, compact | no |
| `getCoverage` | `{}` | `index_meta`: run, `as_of`, limitations, counts | no |
| `proposeLeads` | `{tcadIds[] (≤25)}` | which are already leads | **no — never writes** |

`oracleCoverage` (MCP-backed, A-14-gated) is **not built this round** — the config
flag stays off; `getCoverage` reads the same index-metadata fields from Task A's published manifest,
read directly by CID.
