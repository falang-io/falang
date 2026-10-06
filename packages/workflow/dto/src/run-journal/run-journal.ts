/**
 * Run journal (ADR 0059 (private)): an append-only per-run log of a workflow execution — `log` icons,
 * the trigger payload, accepted user input, AI calls, outgoing messages and every error/problem.
 *
 * This file is the shared contract between its producers (the compiled workflow via a Temporal sink,
 * the runner's activity wrapper, the backend itself), the backend's ingest/storage, and the client.
 * Dependency-free on purpose (the runner imports it).
 */

export const RUN_JOURNAL_KINDS = ['log', 'trigger', 'user-input', 'ai', 'message-out', 'error'] as const;
export type TRunJournalKind = (typeof RUN_JOURNAL_KINDS)[number];

export const RUN_JOURNAL_LEVELS = ['info', 'warn', 'error'] as const;
export type TRunJournalLevel = (typeof RUN_JOURNAL_LEVELS)[number];

export type TRunJournalEnv = 'dev' | 'prod';

/** One entry as a producer sends it (pod → backend ingest; backend-side producers call the service with the same shape). */
export interface IRunJournalEntryInput {
  readonly workflowId: string;
  /** `null` for an entry about a workflow that couldn't be attributed to a run (undeliverable input). */
  readonly runId: string | null;
  /** Idempotency key, unique per `workflowId` — see `buildWorkflowSourceKey`/`buildActivitySourceKey`. */
  readonly sourceKey: string;
  readonly kind: TRunJournalKind;
  readonly level: TRunJournalLevel;
  readonly documentId?: string | null;
  readonly nodeId?: string | null;
  readonly vendor?: string | null;
  /** Short human-readable line. */
  readonly message: string;
  /** Structured details. Content keys (prompts, answers, texts, payloads) are stripped at ingest when the project disables text storage; only `RUN_JOURNAL_METADATA_KEYS` survive then. */
  readonly data?: Readonly<Record<string, unknown>> | null;
  /** ISO 8601 time on the producer. */
  readonly ts: string;
}

/** Body of `POST /internal/projects/:projectId/run-journal` (internal port, `ProjectTokenGuard`; `projectId` comes from the route, never the body). */
export interface IRunJournalIngestBody {
  readonly env: TRunJournalEnv;
  readonly buildId: string | null;
  readonly entries: readonly IRunJournalEntryInput[];
}

export const RUN_JOURNAL_INGEST_PATH = (projectId: string): string => `/internal/projects/${projectId}/run-journal`;
/** Max entries per ingest request; a producer splits bigger batches. */
export const RUN_JOURNAL_INGEST_MAX_ENTRIES = 500;

/** Size limits applied by the backend at ingest (longer values are cut and the entry marked `truncated`). */
export const RUN_JOURNAL_MESSAGE_MAX_BYTES = 1024;
export const RUN_JOURNAL_DATA_STRING_MAX_BYTES = 32 * 1024;
export const RUN_JOURNAL_DATA_MAX_BYTES = 128 * 1024;

/**
 * `data` keys that are metadata, not user content — the only ones kept when a project has
 * "store texts" off (`texts_stripped`). Producers should put metadata under these names.
 */
export const RUN_JOURNAL_METADATA_KEYS = [
  'activity',
  'attempt',
  'durationMs',
  'errorType',
  'lostCount',
  'model',
  'optionCount',
  'sizeBytes',
  'timeout',
  'usage',
  'final',
] as const;

/** An entry as read back by the client. */
export interface IRunJournalEntry {
  /** bigserial, as a string. Monotonic — the `after` cursor. */
  readonly id: string;
  readonly projectId: string;
  readonly env: TRunJournalEnv;
  readonly buildId: string | null;
  readonly workflowId: string;
  readonly runId: string | null;
  readonly documentId: string | null;
  readonly nodeId: string | null;
  readonly vendor: string | null;
  readonly kind: TRunJournalKind;
  readonly level: TRunJournalLevel;
  readonly message: string;
  readonly data: Readonly<Record<string, unknown>> | null;
  readonly truncated: boolean;
  readonly textsStripped: boolean;
  readonly ts: string;
}

/**
 * Response of `GET /projects/:id/runs/:workflowId/:runId/journal?after=&limit=` and
 * `GET /projects/:id/workflows/:workflowId/journal?after=&limit=` (owner-scoped). Entries are ordered
 * by `id` ascending; `after` is an entry `id`; `nextAfter` is the last returned id (or the request's
 * `after` when nothing new) so a poller can keep passing it back.
 */
export interface IRunJournalPage {
  readonly entries: readonly IRunJournalEntry[];
  readonly nextAfter: string | null;
}

export const RUN_JOURNAL_PAGE_DEFAULT_LIMIT = 200;
export const RUN_JOURNAL_PAGE_MAX_LIMIT = 1000;

/** `GET`/`PUT /projects/:id/run-journal/settings` (owner only). */
export interface IRunJournalSettings {
  readonly storeTexts: boolean;
}

// ── Workflow side (compiled code → Temporal sink → runner) ──────────────────────────────────────

/** Sink name and method: `proxySinks<{ falangJournal: { append(entry: IWorkflowJournalSinkEntry): void } }>()`. */
export const RUN_JOURNAL_SINK_NAME = 'falangJournal';
export const RUN_JOURNAL_SINK_METHOD = 'append';

/** What the compiled workflow's `__falangJournal(…)` hands to the sink; the runner adds `workflowId`/`runId` from `workflowInfo`. */
export interface IWorkflowJournalSinkEntry {
  /** Deterministic per-execution counter (starts at 0), so replay produces the same keys. */
  readonly seq: number;
  readonly kind: TRunJournalKind;
  readonly level: TRunJournalLevel;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>> | null;
  readonly documentId: string | null;
  readonly nodeId: string | null;
  /** Workflow time (`Date.now()` inside the workflow — deterministic), ms since epoch. */
  readonly ts: number;
}

/** Non-function export of the compiled workflows module, read by the workflow interceptor module bundled with it. */
export const WORKFLOW_JOURNAL_RUNTIME_EXPORT = '__falangJournalRuntime';
export interface IWorkflowJournalRuntime {
  /** The top position frame, or `null` without position tracking / outside any function. */
  currentFrame(): { readonly documentId: string; readonly nodeId: string | null } | null;
}

/** Temporal header carrying the scheduling node to the activity: payload `{ documentId, nodeId }` (default payload converter). */
export const FALANG_NODE_HEADER = 'falang-node';

export interface IFalangNodeHeader {
  readonly documentId: string;
  readonly nodeId: string | null;
}

// ── Activity side (compiled metadata → runner wrapper) ─────────────────────────────────────────

/** Name of the activities-module export: activity name → `ICompiledActivityJournalSpec`. */
export const ACTIVITY_JOURNAL_EXPORT = '__falangActivityJournal';

export interface ICompiledActivityJournalSpec {
  readonly kind: 'ai' | 'message-out';
  /** Argument names (from the descriptor's `journal.args`) with their position in the activity call. */
  readonly args: readonly { readonly name: string; readonly index: number }[];
  /** Copy the activity result into `data.result` (default true at the descriptor level). */
  readonly result: boolean;
}

/** Token usage an AI activity reports (on its internal `{ text, usage, model }` result). */
export interface IRunJournalAiUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

/** Internal result of an AI text activity — the vendor emitter unwraps `.text` so scheme variables stay `string`. */
export interface IAiTextActivityResult {
  readonly text: string;
  readonly usage?: IRunJournalAiUsage;
  readonly model?: string;
}

// ── Source keys (idempotency, unique per workflowId) ────────────────────────────────────────────

export const buildWorkflowSourceKey = (runId: string, seq: number): string => `${runId}:w:${seq}`;
export const buildActivitySourceKey = (runId: string, activityId: string, attempt: number): string =>
  `${runId}:a:${activityId}:${attempt}`;
