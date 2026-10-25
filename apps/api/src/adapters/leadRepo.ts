// B-07 Data layer: the `LeadRepo` port and its DynamoDB implementation (data-model.md,
// architecture-constitution.md ADR-04, §4). Every write is ONE TransactWriteItems call with
// condition expressions evaluated by DynamoDB itself:
//   create        LEAD put  attribute_not_exists(pk)   <- duplicate protection (P0-6), no read first
//                 SIGNALS put, EVT#0 put (both attribute_not_exists(pk))
//   updateStatus  LEAD update  eventSequence = :expected   (the optimistic sequence check)
//   / addNote     EVT#n put    attribute_not_exists(pk)    (gapless: n = expected + 1 or refused)
// `status`/`assignee` on LEAD are written only inside these transactions (PO-approved ADR-04
// deviation, architecture-constitution.md §13).
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  Lead,
  LeadEvent,
  LeadSignals,
  LeadStatus as LeadStatusSchema,
  type LeadStatus,
} from "@crm/shared";
import {
  LeadAlreadyExistsError,
  LeadNotFoundError,
  LeadSequenceConflictError,
} from "../leadErrors.js";

export { LeadAlreadyExistsError, LeadNotFoundError, LeadSequenceConflictError };

export type StoredLead = Lead & { leadKey: string };

export interface NewLeadRecord {
  readonly leadKey: string;
  readonly leadId: string;
  readonly address: string;
  readonly lat: number;
  readonly lon: number;
  readonly assignee: string;
  readonly createdFrom: Lead["createdFrom"];
  readonly sourceManifestCid: string;
  readonly createdAt: string;
  readonly signals: Omit<LeadSignals, "capturedAt">;
}

export interface LeadDetailRecord {
  readonly lead: StoredLead;
  readonly signals: LeadSignals | undefined;
  readonly events: readonly LeadEvent[];
}

interface WriteBase {
  readonly leadKey: string;
  readonly by: string;
  readonly at: string;
  /** When omitted the repo reads the current sequence first, then asserts it in the transaction. */
  readonly expectedSequence?: number;
}

export type UndoCreateReason = "NOT_UNDOABLE" | "NOT_FOUND" | "NOT_OWNER" | "TOO_OLD" | "CHANGED";

export type UndoCreateResult =
  | { readonly deleted: true }
  | { readonly deleted: false; readonly reason: UndoCreateReason };

export interface UndoCreateInput {
  readonly leadKey: string;
  /** The caller; must be the lead's assignee (the creator). */
  readonly by: string;
  /** When given, the lead must also carry this leadId (guards against a stale undo of a lead that
   *  was undone and then created again). */
  readonly leadId?: string | undefined;
  /** ISO timestamp; the lead must have been created at or after it. */
  readonly createdNotBefore: string;
}

/** Who-owns-what is deliberately absent: presence is shared across assignees (no owner, notes). */
export interface LeadPresenceRecord {
  readonly leadKey: string;
  readonly leadId: string;
  readonly status: LeadStatus;
}

/** DynamoDB BatchGetItem accepts at most 100 keys per call. */
export const BATCH_GET_MAX_KEYS = 100;

/** The port the Application layer is injected with (architecture-constitution.md §4). */
export interface LeadRepo {
  create(record: NewLeadRecord): Promise<StoredLead>;
  updateStatus(input: WriteBase & { status: LeadStatus }): Promise<StoredLead>;
  addNote(input: WriteBase & { text: string }): Promise<StoredLead>;
  get(leadKey: string): Promise<LeadDetailRecord | null>;
  /** Deletes LEAD + SIGNALS + EVT#0 in ONE conditional transaction, or nothing (see impl). */
  undoCreate(input: UndoCreateInput): Promise<UndoCreateResult>;
  /** Lead presence by key across all assignees, via BatchGetItem (LEAD items only). */
  presence(leadKeys: readonly string[]): Promise<LeadPresenceRecord[]>;
  /** GSI1 (assignee), newest first (createdAt descending). */
  listByAssignee(assignee: string): Promise<StoredLead[]>;
  /** GSI2 (status), newest first (createdAt descending). */
  listByStatus(status: LeadStatus): Promise<StoredLead[]>;
}

export interface LeadRepoDeps {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
  /** Backoff between conflict retries; injectable so tests do not wait. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Attempts (first try included) before a persistent TransactionConflict is surfaced. */
export const MAX_CONFLICT_ATTEMPTS = 6;

/** Hard cap on items one list call will page through (demo-scale table; bounds Lambda memory). */
export const MAX_LISTED_LEADS = 1000;

export function evtSortKey(sequence: number): string {
  return `EVT#${String(sequence).padStart(10, "0")}`;
}

function toStoredLead(item: Record<string, unknown>): StoredLead {
  // Lead is not .strict(): pk/sk/GSI keys are stripped; the pk becomes the exposed leadKey.
  return { ...Lead.parse(item), leadKey: String(item.pk) };
}

/** Index of the first failed item in a cancelled transaction, or -1 when it was not a condition
 *  failure (throttling, validation, ...), which must propagate as-is. */
function failedConditionIndex(error: unknown): number {
  if (!(error instanceof Error) || error.name !== "TransactionCanceledException") return -1;
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  return reasons?.findIndex((r) => r.Code === "ConditionalCheckFailed") ?? -1;
}

/** True when DynamoDB cancelled the transaction because another in-flight transaction touches
 *  the same item (reason TransactionConflict). No condition was evaluated, so the right response
 *  is to try again and learn the real outcome, not to report a failure. */
function isTransactionConflict(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== "TransactionCanceledException") return false;
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  return (
    reasons?.some((r) => r.Code === "TransactionConflict") === true &&
    !reasons.some((r) => r.Code === "ConditionalCheckFailed")
  );
}

/** DynamoDB rejects undefined attribute values; optional signals are simply omitted. */
function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function createDynamoLeadRepo(deps: LeadRepoDeps): LeadRepo {
  const { tableName, client } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  /** Re-runs a whole write (each attempt re-reads and re-checks its own conditions, so a retry is
   *  safe) while DynamoDB keeps cancelling it with TransactionConflict. Jittered backoff keeps
   *  20 simultaneous callers from colliding again in lockstep. */
  async function withConflictRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run();
      } catch (error) {
        if (!isTransactionConflict(error) || attempt >= MAX_CONFLICT_ATTEMPTS) throw error;
        await sleep(20 * attempt + Math.floor(Math.random() * 40));
      }
    }
  }

  async function getLeadItem(leadKey: string): Promise<Record<string, unknown> | undefined> {
    const res = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: leadKey, sk: "LEAD" },
        ConsistentRead: true,
      }),
    );
    return res.Item;
  }

  async function queryAll(
    indexName: "GSI1" | "GSI2",
    attr: "assignee" | "status",
    value: string,
  ): Promise<StoredLead[]> {
    const out: StoredLead[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: "#k = :v",
          ExpressionAttributeNames: { "#k": attr },
          ExpressionAttributeValues: { ":v": value },
          ScanIndexForward: false, // sort key is createdAt: newest lead first (AC-1)
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of res.Items ?? []) out.push(toStoredLead(item));
      startKey = res.LastEvaluatedKey;
    } while (startKey !== undefined && out.length < MAX_LISTED_LEADS);
    return out.slice(0, MAX_LISTED_LEADS);
  }

  /** Shared append: bump LEAD (and optionally its status) and put EVT#{n} in one transaction. */
  async function append(
    input: WriteBase,
    event: { kind: LeadEvent["kind"]; change: (current: StoredLead) => string },
    nextStatus?: LeadStatus,
  ): Promise<StoredLead> {
    const item = await getLeadItem(input.leadKey);
    if (item === undefined) throw new LeadNotFoundError(input.leadKey);
    const current = toStoredLead(item);
    const expected = input.expectedSequence ?? current.eventSequence;
    const next = expected + 1;
    const names: Record<string, string> = { "#seq": "eventSequence" };
    const values: Record<string, unknown> = { ":expected": expected, ":next": next };
    let update = "SET #seq = :next";
    if (nextStatus !== undefined) {
      update += ", #status = :status";
      names["#status"] = "status";
      values[":status"] = nextStatus;
    }
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: { pk: input.leadKey, sk: "LEAD" },
                UpdateExpression: update,
                ConditionExpression: "attribute_exists(pk) AND #seq = :expected",
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values,
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  pk: input.leadKey,
                  sk: evtSortKey(next),
                  sequence: next,
                  at: input.at,
                  by: input.by,
                  change: event.change(current),
                  kind: event.kind,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (failedConditionIndex(error) >= 0) throw new LeadSequenceConflictError(input.leadKey);
      throw error;
    }
    return { ...current, eventSequence: next, status: nextStatus ?? current.status };
  }

  async function createOnce(r: Parameters<LeadRepo["create"]>[0]): Promise<StoredLead> {
    const lead = {
      pk: r.leadKey,
      sk: "LEAD",
      leadId: r.leadId,
      address: r.address,
      lat: r.lat,
      lon: r.lon,
      status: "new" as const,
      assignee: r.assignee,
      createdFrom: r.createdFrom,
      sourceManifestCid: r.sourceManifestCid,
      createdAt: r.createdAt,
      eventSequence: 0,
    };
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: lead,
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  pk: r.leadKey,
                  sk: "SIGNALS",
                  ...definedOnly(r.signals),
                  capturedAt: r.createdAt,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: {
                  pk: r.leadKey,
                  sk: evtSortKey(0),
                  sequence: 0,
                  at: r.createdAt,
                  by: r.assignee,
                  change: "created",
                  kind: "create",
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (failedConditionIndex(error) >= 0) throw new LeadAlreadyExistsError(r.leadKey);
      throw error;
    }
    return toStoredLead(lead);
  }

  /** Why an undo transaction was refused. Runs only AFTER the transaction failed, purely to name
   *  the reason; it never decides whether to delete (the transaction's conditions did). */
  async function diagnoseUndo(input: UndoCreateInput): Promise<UndoCreateResult> {
    const item = await getLeadItem(input.leadKey);
    if (item === undefined) return { deleted: false, reason: "NOT_FOUND" };
    if (input.leadId !== undefined && item.leadId !== input.leadId)
      return { deleted: false, reason: "NOT_FOUND" };
    if (item.assignee !== input.by) return { deleted: false, reason: "NOT_OWNER" };
    if (item.eventSequence !== 0) return { deleted: false, reason: "CHANGED" };
    if (item.status !== "new") return { deleted: false, reason: "NOT_UNDOABLE" };
    if (String(item.createdAt) < input.createdNotBefore)
      return { deleted: false, reason: "TOO_OLD" };
    return { deleted: false, reason: "CHANGED" };
  }

  async function undoOnce(input: UndoCreateInput): Promise<UndoCreateResult> {
    const key = input.leadKey;
    const leadValues: Record<string, unknown> = {
      ":by": input.by,
      ":new": "new",
      ":zero": 0,
      ":cutoff": input.createdNotBefore,
    };
    let leadCondition =
      "attribute_exists(pk) AND assignee = :by AND #status = :new AND eventSequence = :zero AND createdAt >= :cutoff";
    if (input.leadId !== undefined) {
      leadCondition += " AND leadId = :leadId";
      leadValues[":leadId"] = input.leadId;
    }
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: tableName,
                Key: { pk: key, sk: "LEAD" },
                ConditionExpression: leadCondition,
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: leadValues,
              },
            },
            // Idempotent on purpose: a missing SIGNALS item is not a reason to keep the lead.
            { Delete: { TableName: tableName, Key: { pk: key, sk: "SIGNALS" } } },
            {
              Delete: {
                TableName: tableName,
                Key: { pk: key, sk: evtSortKey(0) },
                ConditionExpression:
                  "attribute_exists(pk) AND #kind = :create AND #seq = :zero",
                // "sequence" is a DynamoDB reserved word: it must go through a name placeholder.
                ExpressionAttributeNames: { "#kind": "kind", "#seq": "sequence" },
                ExpressionAttributeValues: { ":create": "create", ":zero": 0 },
              },
            },
          ],
        }),
      );
      return { deleted: true };
    } catch (error) {
      if (failedConditionIndex(error) >= 0) return diagnoseUndo(input);
      throw error;
    }
  }

  return {
    undoCreate(input) {
      return withConflictRetry(() => undoOnce(input));
    },

    async presence(leadKeys) {
      const unique = [...new Set(leadKeys)];
      const out: LeadPresenceRecord[] = [];
      for (let i = 0; i < unique.length; i += BATCH_GET_MAX_KEYS) {
        let keys: Record<string, unknown>[] = unique
          .slice(i, i + BATCH_GET_MAX_KEYS)
          .map((pk) => ({ pk, sk: "LEAD" }));
        // UnprocessedKeys (throttling) are retried a bounded number of times, then surfaced.
        for (let attempt = 1; keys.length > 0; attempt++) {
          if (attempt > MAX_CONFLICT_ATTEMPTS)
            throw new Error("BatchGetItem left unprocessed keys");
          if (attempt > 1) await sleep(20 * attempt);
          const res = await client.send(
            new BatchGetCommand({
              RequestItems: {
                [tableName]: {
                  Keys: keys,
                  ProjectionExpression: "pk, leadId, #status",
                  ExpressionAttributeNames: { "#status": "status" },
                },
              },
            }),
          );
          for (const item of res.Responses?.[tableName] ?? []) {
            out.push({
              leadKey: String(item.pk),
              leadId: String(item.leadId),
              status: LeadStatusSchema.parse(item.status),
            });
          }
          keys = (res.UnprocessedKeys?.[tableName]?.Keys ?? []) as Record<string, unknown>[];
        }
      }
      return out;
    },

    create(r) {
      return withConflictRetry(() => createOnce(r));
    },

    updateStatus(input) {
      return withConflictRetry(() =>
        append(
          input,
          { kind: "statusChange", change: (cur) => `status: ${cur.status} -> ${input.status}` },
          input.status,
        ),
      );
    },

    addNote(input) {
      return withConflictRetry(() =>
        append(input, { kind: "note", change: () => `note: ${JSON.stringify(input.text)}` }),
      );
    },

    async get(leadKey) {
      const items: Record<string, unknown>[] = [];
      let startKey: Record<string, unknown> | undefined;
      do {
        const res = await client.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "pk = :pk",
            ConsistentRead: true,
            ExpressionAttributeValues: { ":pk": leadKey },
            ExclusiveStartKey: startKey,
          }),
        );
        items.push(...(res.Items ?? []));
        startKey = res.LastEvaluatedKey;
      } while (startKey !== undefined);
      const leadItem = items.find((i) => i.sk === "LEAD");
      if (leadItem === undefined) return null;
      const signalsItem = items.find((i) => i.sk === "SIGNALS");
      const events = items
        .filter((i) => String(i.sk).startsWith("EVT#"))
        .map((i) => LeadEvent.parse(i))
        .sort((a, b) => a.sequence - b.sequence);
      return {
        lead: toStoredLead(leadItem),
        signals: signalsItem === undefined ? undefined : LeadSignals.parse(signalsItem),
        events,
      };
    },

    listByAssignee: (assignee) => queryAll("GSI1", "assignee", assignee),
    listByStatus: (status) => queryAll("GSI2", "status", status),
  };
}

export function createDynamoLeadRepoFromEnv(region?: string): LeadRepo {
  const tableName = process.env.CRM_LEADS_TABLE_NAME;
  if (tableName === undefined || tableName === "")
    throw new Error("CRM_LEADS_TABLE_NAME is not set");
  return createDynamoLeadRepo({
    tableName,
    client: DynamoDBDocumentClient.from(new DynamoDBClient(region ? { region } : {})),
  });
}
