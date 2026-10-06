/**
 * Run journal (ADR 0059 (private)): the shared names and shapes of the producers (the compiled workflow via a
 * Temporal sink, the runner's activity wrapper), the backend's ingest/read API and the compiler's exports.
 * Dependency-free on purpose (the runner and the compiler import it).
 */

export const RUN_JOURNAL_KINDS = ['log', 'trigger', 'user-input', 'ai', 'message-out', 'error'] as const;
export type TRunJournalKind = (typeof RUN_JOURNAL_KINDS)[number];

export const RUN_JOURNAL_LEVELS = ['info', 'warn', 'error'] as const;
export type TRunJournalLevel = (typeof RUN_JOURNAL_LEVELS)[number];

export const RUN_JOURNAL_ENVS = ['dev', 'prod'] as const;
export type TRunJournalEnv = (typeof RUN_JOURNAL_ENVS)[number];

// ── Runner → backend: ingest ─────────────────────────────────────────────────────────────────────

/** One entry of the ingest body, exactly as the runner sends it. */
export interface IRunJournalWireEntry {
  readonly workflowId: string;
  readonly runId: string | null;
  /** Idempotency key, unique per `workflowId` — see the `build*SourceKey` helpers. */
  readonly sourceKey: string;
  readonly kind: TRunJournalKind;
  readonly level: TRunJournalLevel;
  /** Short human-readable line (capped at `RUN_JOURNAL_MESSAGE_MAX_LENGTH` by the backend). */
  readonly message: string;
  readonly data: Record<string, unknown> | null;
  readonly documentId: string | null;
  readonly nodeId: string | null;
  readonly vendor: string | null;
  /** Producer time, epoch milliseconds (an unparsable value falls back to the receive time). */
  readonly ts: number;
}

/** Body of `POST /internal/projects/:projectId/run-journal` (internal port, `ProjectTokenGuard`; `projectId` from the route only). Answer: 204. */
export interface IRunJournalIngestBody {
  readonly env: TRunJournalEnv;
  readonly buildId: string | null;
  readonly entries: readonly IRunJournalWireEntry[];
}

export const RUN_JOURNAL_INGEST_PATH = (projectId: string): string => `/internal/projects/${projectId}/run-journal`;
/** Max entries per ingest request; a producer splits bigger batches. */
export const RUN_JOURNAL_INGEST_MAX_ENTRIES = 500;

/** Limits applied by the backend at ingest (longer values are cut and the entry marked `truncated`); lengths are in characters. */
export const RUN_JOURNAL_MESSAGE_MAX_LENGTH = 1024;
export const RUN_JOURNAL_DATA_STRING_MAX_LENGTH = 32 * 1024;
export const RUN_JOURNAL_DATA_MAX_LENGTH = 128 * 1024;

/** `workflow-dev-*` task queues are the dev stand, everything else is prod. */
export const runJournalEnvFromTaskQueue = (taskQueue: string): TRunJournalEnv =>
  taskQueue.startsWith('workflow-dev-') ? 'dev' : 'prod';

/**
 * Top-level `data` keys that are metadata, not user content — the only scalar keys kept when a project has
 * "store texts" off (`usage` and `position` are also kept, but only their numeric / id parts). Every other
 * key (`args`, `result`, `payload`, `value`, `answerData`, …) is replaced by `<key>Length`.
 */
export const RUN_JOURNAL_METADATA_KEYS = [
  'activity',
  'attempt',
  'durationMs',
  'errorType',
  'final',
  'lost',
  'model',
  'resolvedAt',
  'timeout',
] as const;

// ── Backend → client: read API (owner-scoped) ────────────────────────────────────────────────────

/** An entry as the read API returns it. */
export interface IRunJournalEntry {
  /** bigserial as a string; monotonic in insertion order — the `after` cursor. */
  readonly id: string;
  readonly workflowId: string;
  readonly runId: string | null;
  readonly env: TRunJournalEnv;
  readonly kind: TRunJournalKind;
  readonly level: TRunJournalLevel;
  readonly message: string;
  readonly data: Record<string, unknown> | null;
  readonly documentId: string | null;
  readonly nodeId: string | null;
  readonly vendor: string | null;
  readonly truncated: boolean;
  readonly textsStripped: boolean;
  /** ISO 8601. */
  readonly ts: string;
}

/**
 * Response of `GET /projects/:id/runs/:workflowId/:runId/journal?after=&limit=` and
 * `GET /projects/:id/workflows/:workflowId/journal?after=&limit=`. Entries come in `id` ascending order
 * (the cursor order); `after` is the last seen `id`. Clients display them sorted by `(ts, id)`.
 */
export interface IRunJournalPage {
  readonly entries: readonly IRunJournalEntry[];
  readonly hasMore: boolean;
}

export const RUN_JOURNAL_PAGE_DEFAULT_LIMIT = 200;
export const RUN_JOURNAL_PAGE_MAX_LIMIT = 1000;

/** `GET`/`PUT /projects/:id/journal-settings` (owner only). */
export interface IRunJournalSettings {
  readonly storeTexts: boolean;
}

// ── Workflow side (compiled code → Temporal sink → runner) ──────────────────────────────────────

/** `proxySinks<{ falangJournal: { append(entry: IRunJournalSinkEntry): void } }>()`. */
export const RUN_JOURNAL_SINK_NAME = 'falangJournal';
export const RUN_JOURNAL_SINK_METHOD = 'append';
/** Module-level helper of the compiled workflow that adds `seq`/`ts` and calls the sink. */
export const RUN_JOURNAL_WORKFLOW_FN = '__falangJournal';

/** What the sink receives. `documentId`/`nodeId` default to the top position frame; the runner adds `workflowId`/`runId` from `workflowInfo`. */
export interface IRunJournalSinkEntry {
  /** Deterministic per-execution counter, so a replay produces the same source keys. */
  readonly seq: number;
  /** Workflow time (`Date.now()` inside the workflow), epoch ms. */
  readonly ts: number;
  readonly kind: TRunJournalKind;
  readonly level: TRunJournalLevel;
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly documentId?: string;
  readonly nodeId?: string;
  readonly vendor?: string;
}

/** Temporal header set by the workflow's outbound interceptor on every scheduled activity; payload `IRunJournalNodeHeader` (default payload converter). */
export const RUN_JOURNAL_NODE_HEADER = 'falang-node';
export interface IRunJournalNodeHeader {
  readonly documentId: string;
  readonly nodeId: string | null;
}

// ── Activity side (compiled metadata → runner wrapper) ──────────────────────────────────────────

/** Exports of the compiled `activities.ts` the runner reads (and strips) before registering activities. */
export const ACTIVITY_VENDORS_EXPORT = '__falangActivityVendors';
export const ACTIVITY_JOURNAL_EXPORT = '__falangActivityJournal';
export const ACTIVITY_PARAMS_EXPORT = '__falangActivityParams';
/** Export of the compiled `workflows.ts` (position tracking on): the frame stack the header interceptor reads. */
export const POSITION_STACK_EXPORT = '__falangPositionStack';

/** What the journal records about one activity call — an explicit allowlist of argument names, never "all arguments". */
export interface IRunJournalActivitySpec {
  readonly kind: 'ai' | 'message-out';
  /** Parameter names (of the activity's signature) copied into `data.args`. */
  readonly args: readonly string[];
  /** Copy the result into `data.result` (default true). */
  readonly result?: boolean;
}

export interface IRunJournalAiUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

/** Internal result of an AI text activity; the vendor emitter unwraps `.text`. The runner journals `model`/`usage` from it. */
export interface IRunJournalAiTextResult {
  readonly text: string;
  readonly usage?: IRunJournalAiUsage;
  readonly model?: string;
}

// ── Source keys (idempotency, unique per workflowId) ─────────────────────────────────────────────

export const buildWorkflowSourceKey = (runId: string, seq: number): string => `${runId}:w:${seq}`;
export const buildActivitySourceKey = (runId: string, activityId: string, attempt: number): string =>
  `${runId}:a:${activityId}:${attempt}`;
export const buildActivityErrorSourceKey = (runId: string, activityId: string, attempt: number): string =>
  `${buildActivitySourceKey(runId, activityId, attempt)}:err`;
export const buildLostNoticeSourceKey = (runId: string, n: number): string => `${runId}:lost:${n}`;
