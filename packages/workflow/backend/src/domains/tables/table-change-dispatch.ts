import type { ITableRecord, ITableTriggerWirePayload, TTableDispatchStatus, TTableSource } from '@falang/workflow-dto';

/** A `table_record_changes` row as the dispatcher reads it. */
export interface IChangeRow {
  readonly id: number;
  readonly projectId: string;
  readonly tableId: string;
  readonly env: 'dev' | 'prod';
  readonly recordId: string;
  readonly op: 'created' | 'updated' | 'deleted';
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly changedFields: readonly string[] | null;
  readonly source: string;
  readonly createdAt: Date;
}

/** Keys a change row's `before`/`after` may carry next to the field-id keyed data (none of them can be a field id). */
const SYSTEM_KEYS = new Set(['version', 'createdAt', 'updatedAt']);

const toRecord = (
  recordId: string,
  snapshot: Record<string, unknown>,
  fallbackCreatedAt: Date,
  changedAt: Date,
): ITableRecord => {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (!SYSTEM_KEYS.has(key)) data[key] = value;
  }
  const version = snapshot.version;
  const createdAt = snapshot.createdAt;
  const updatedAt = snapshot.updatedAt;
  return {
    id: recordId,
    version: typeof version === 'number' ? version : 1,
    createdAt: typeof createdAt === 'string' ? createdAt : fallbackCreatedAt.toISOString(),
    updatedAt: typeof updatedAt === 'string' ? updatedAt : changedAt.toISOString(),
    data,
  };
};

/**
 * The id-keyed signal payload for one change (`ITableTriggerWirePayload`, amendment A1): `record` is the row after the
 * change (the deleted row for `deleted`), `previous` the row before it (`updated` only). `recordCreatedAt` is the
 * record's real creation time when still known (a live record), else the change time.
 */
export const buildWirePayload = (change: IChangeRow, recordCreatedAt?: Date): ITableTriggerWirePayload => {
  const created = recordCreatedAt ?? change.createdAt;
  const current = change.op === 'deleted' ? change.before : change.after;
  const payload: ITableTriggerWirePayload = {
    table: change.tableId,
    record: toRecord(change.recordId, current ?? {}, created, change.createdAt),
    source: change.source as TTableSource,
  };
  if (change.op === 'updated') {
    return {
      ...payload,
      ...(change.before ? { previous: toRecord(change.recordId, change.before, created, change.createdAt) } : {}),
      changedFieldIds: [...(change.changedFields ?? [])],
    };
  }
  return payload;
};

export const TRIGGER_NAME_BY_OP: Readonly<Record<IChangeRow['op'], string>> = {
  created: 'table-record-created',
  updated: 'table-record-updated',
  deleted: 'table-record-deleted',
};

export interface ITableTriggerTarget {
  /** The `trigger-function` document id. */
  readonly documentId: string;
  /** The compiled function (document) name. */
  readonly name: string;
}

/** Marker `dispatch_status` of a row some dispatcher tick has claimed and is delivering (not a final outcome). */
export const CLAIMED_STATUS = 'claimed';
/** A claim older than this is a crashed tick's leftover and is picked up again (delivery is at-least-once). */
export const CLAIM_LEASE_MS = 60_000;

/**
 * What the dispatcher needs from the database. No long transaction spans a delivery: waking a runner and signalling
 * Temporal query the database themselves (a held connection would deadlock the single-session PGlite driver), so
 * rows are claimed with a short `FOR UPDATE SKIP LOCKED` transaction that stamps them `claimed`, delivered outside any
 * transaction, then marked with their outcome or released back to pending.
 */
export interface IChangeOutboxStore {
  /**
   * Claims up to `limit` undispatched rows with a dispatchable source (oldest first); with `reclaimStale` also rows
   * claimed more than `CLAIM_LEASE_MS` ago.
   */
  claim(limit: number, now: Date, reclaimStale: boolean): Promise<IChangeRow[]>;
  /** Rows of `(tableId, env)` marked `delivered` since `since`. */
  countDelivered(tableId: string, env: 'dev' | 'prod', since: Date): Promise<number>;
  /** Creation times of still-existing records. */
  recordCreatedAt(recordIds: readonly string[]): Promise<Map<string, Date>>;
  mark(changeId: number, status: TTableDispatchStatus, at: Date): Promise<void>;
  /** Puts a claimed row back to pending (retry next tick). */
  release(changeId: number): Promise<void>;
}
