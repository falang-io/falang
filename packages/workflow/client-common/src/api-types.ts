// oxlint-disable max-lines -- grew past 300 lines with ADRs 0037-0041 (private)'s schedule/files/task
// `IApi*` response types landing in the same run of work; each addition is small and self-contained
// (mirrors one backend response shape, same pattern as every existing `IApi*` here), not accumulated
// complexity worth splitting into another file.
import type { ILlmResponse, ILlmToolDefinition, TLlmMessage } from '@falang/agent';
import type { IDebugLocation, IDebugVariable, TDebugPauseReason, TDebugTerminationReason } from '@falang/debug';
import type { INode, IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';

export interface IApiUser {
  readonly id: string;
  readonly username: string;
  readonly language: string;
  /** ADR 0030 (private) — gates the "Admin" link and `/admin` itself. */
  readonly role: 'user' | 'admin';
  /** `true` only for the seeded `admin` account while its password is still `admin` — drives the warning banner. */
  readonly defaultPasswordInUse?: boolean;
  readonly email?: string | null;
  /** `false` for a self-registered address not yet confirmed via the mailed link. */
  readonly emailVerified?: boolean;
  readonly activatedAt?: string | null;
  readonly companyName?: string | null;
}

/** `GET /auth/config` (public) — what the login page needs before anyone is signed in. */
export interface IApiAuthConfig {
  readonly selfServiceSignup: boolean;
  readonly termsUrl: string | null;
  /** Integration vendors the deployment switched off (e.g. `sqlite` unless `ENABLE_SQLITE_INTEGRATION=true`) — hidden from the "add integration" picker. */
  readonly disabledVendors?: readonly string[];
  /** Absent on an older backend — derive from `selfServiceSignup` then. */
  readonly signupMode?: 'off' | 'open' | 'application';
  readonly captcha?: { readonly provider: 'recaptcha' | 'smartcaptcha'; readonly siteKey: string } | null;
  readonly mailConfigured?: boolean;
}

/** `POST /auth/register` body in `application` mode (closed beta). */
export interface IApiApplicationInput {
  readonly email: string;
  readonly companyName: string;
  readonly automationInterest: string;
  readonly acceptTerms: boolean;
  readonly captchaToken: string;
}

/** `POST /auth/register` body in `open` mode. */
export interface IApiOpenSignupInput {
  readonly username: string;
  readonly password: string;
  readonly email?: string;
  readonly acceptTerms?: boolean;
}

export interface IApiLoginResult {
  readonly accessToken: string;
  readonly user: IApiUser;
}

/** `GET /project-templates` row — an enabled template offered by "New project". */
export interface IApiProjectTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface IApiProject {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly createdAt: string;
  /** Last mutating write to the project's documents/folders; `null` until the first one. */
  readonly lastEditedAt?: string | null;
}

export interface IApiProjectOwner {
  readonly id: string;
  readonly username: string;
  readonly email: string | null;
}

/** `GET /projects/:id` — `readOnly` when the caller is an admin viewing someone else's project. */
export interface IApiProjectInfo {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly owner: IApiProjectOwner | null;
  readonly readOnly: boolean;
}

/** `IProjectTreeDocument` (`@falang/dto`) plus an optional `lockedUntil` — see ADR 0029 (private)'s "Document locks" decision and `DocumentsService.listTree` on the backend, which computes this alongside the tree listing. */
export interface IApiProjectTreeDocument extends IProjectTreeDocument {
  readonly lockedUntil?: string;
}

export interface IApiProjectTree {
  readonly folders: IProjectTreeFolder[];
  readonly documents: IApiProjectTreeDocument[];
}

/** `GET /projects/:id/documents/locks` — active locks only, polled every 5s while a project workspace is open. See `DocumentsService.getLocks`. */
export interface IApiDocumentLock {
  readonly documentId: string;
  readonly owner: string;
  readonly expiresAt: string;
}

/** `GET/POST/DELETE /auth/tokens` — see ADR 0029 (private)'s PAT decision. Never carries `tokenHash`/the raw secret, except `rawToken` on `ICreatedApiPersonalAccessToken`, returned exactly once. */
export interface IApiPersonalAccessToken {
  readonly id: string;
  readonly name: string;
  readonly projectId: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
}

export interface ICreatedApiPersonalAccessToken {
  readonly token: IApiPersonalAccessToken;
  readonly rawToken: string;
}

export interface IApiProjectDocument {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly root?: INode;
  readonly data?: unknown;
}

export interface IApiProjectExportFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export interface IApiProjectExportDocument {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly folderId: string | null;
  readonly pinned: boolean;
  readonly root?: INode | null;
  readonly data?: unknown;
}

/** Whole-project export/import envelope — see `ProjectExportService` on the backend. `project.id` is always `''` on export; a fresh id is assigned on import. */
export interface IApiProjectExport {
  readonly formatVersion: 1;
  readonly project: { readonly id: string; readonly name: string };
  readonly folders: readonly IApiProjectExportFolder[];
  readonly documents: readonly IApiProjectExportDocument[];
}

export interface IApiBuildResult {
  readonly projectId: string;
  readonly taskQueue: string;
  /** How many still-open dev executions (e.g. parked Telegram conversations) were terminated to make way for this build. */
  readonly terminatedExecutionsCount: number;
}

export interface IApiGeneratedFile {
  readonly path: string;
  readonly content: string;
}

export interface IApiProjectVersion {
  readonly id: string;
  readonly projectId: string;
  readonly versionNumber: number;
  readonly buildId: string;
  readonly createdAt: string;
  /** Production's version — where new runs and triggers go while prod is on, and what Start brings up. Only in `listVersions` rows. */
  readonly current?: boolean;
  /** Whether this version's runner pod is up (an idle prod pod is scaled to zero and woken by its triggers). Only in `listVersions` rows. */
  readonly running?: boolean;
}

export interface IApiFunctionParameter {
  readonly name: string;
  readonly type: TVariableInfo;
}

export interface IApiFunctionSignature {
  readonly name: string;
  readonly parameters: readonly IApiFunctionParameter[];
  readonly returnValue?: TVariableInfo;
}

export type TApiRunTarget = 'dev' | 'published';

export interface IApiRunFunctionResult {
  readonly workflowId: string;
  readonly taskQueue: string;
  readonly status: 'completed' | 'failed' | 'timeout';
  readonly result?: unknown;
  readonly message?: string;
}

export interface IApiWorkflowRunSummary {
  readonly workflowId: string;
  readonly runId: string;
  readonly status: string;
  readonly workflowName: string;
  readonly taskQueue: string;
  readonly buildId: string | null;
  readonly startTime: string;
  readonly closeTime: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly env: 'dev' | 'prod';
  /** `'dev'` for the unversioned dev task queue, otherwise the published version number as a string. */
  readonly version: string;
}

export type TApiRunJournalKind = 'log' | 'trigger' | 'user-input' | 'ai' | 'message-out' | 'error';
export type TApiRunJournalLevel = 'info' | 'warn' | 'error';

/** One run-journal row (ADR 0059 (private)). */
export interface IApiRunJournalEntry {
  /** bigint as a string — the `after` cursor. */
  readonly id: string;
  readonly workflowId: string;
  readonly runId: string | null;
  readonly env: 'dev' | 'prod';
  readonly kind: TApiRunJournalKind;
  readonly level: TApiRunJournalLevel;
  readonly message: string;
  readonly data: Record<string, unknown> | null;
  readonly documentId: string | null;
  readonly nodeId: string | null;
  readonly vendor: string | null;
  readonly truncated: boolean;
  readonly textsStripped: boolean;
  /** ISO timestamp. */
  readonly ts: string;
}

export interface IApiRunJournalPage {
  readonly entries: IApiRunJournalEntry[];
  readonly hasMore: boolean;
}

export interface IApiRunJournalSettings {
  readonly storeTexts: boolean;
}

export interface IApiWorkflowRunFilters {
  readonly projectId?: string;
  readonly workflowName?: string;
  readonly version?: string;
  readonly buildId?: string;
}

export interface IApiWorkflowRunEvent {
  readonly id: string;
  readonly time: string | null;
  readonly type: string;
}

export interface IApiWorkflowRunDetail extends IApiWorkflowRunSummary {
  readonly input: unknown;
  readonly result: unknown;
  readonly events: readonly IApiWorkflowRunEvent[];
}

/** `POST /projects/:id/runs` — a started-but-not-awaited dev execution the editor then follows via `getRunPosition`. See ADR 0022 (private). */
export interface IApiStartedRun {
  readonly workflowId: string;
  readonly runId: string;
  readonly taskQueue: string;
  /** How many still-open dev executions were terminated to make way for this one. */
  readonly terminatedExecutionsCount: number;
}

/** One frame of a compiled workflow's position stack — innermost (currently executing function) last. */
export interface IApiWorkflowPositionFrame {
  readonly documentId: string;
  /** `null` between entering a function and its first statement (e.g. a trigger function still waiting for its first signal). */
  readonly nodeId: string | null;
}

/** `GET /projects/:id/runs/:workflowId/:runId/position` — mirrors the backend's `IWorkflowPosition`, see its doc for what each `source` means. */
export interface IApiWorkflowPosition {
  readonly workflowId: string;
  readonly runId: string;
  /** Temporal's own status name — `'RUNNING'`, `'COMPLETED'`, `'FAILED'`, `'TERMINATED'`, … */
  readonly status: string;
  readonly taskQueue: string;
  readonly source: 'query' | 'failure' | 'unavailable' | 'none';
  readonly stack: readonly IApiWorkflowPositionFrame[] | null;
  readonly failureMessage?: string;
}

/** `POST /projects/:id/debug/start` — mirrors `IApiStartedRun`, plus the breakpoints armed before the first statement can run. See ADR 0021 (private) §5. */
export interface IApiStartedDebugSession {
  readonly workflowId: string;
  readonly runId: string;
  readonly taskQueue: string;
  readonly terminatedExecutionsCount: number;
}

/**
 * `GET /projects/:id/debug/:workflowId/state` — mirrors the backend's `IDebugSessionSnapshot`.
 * `'runner-stopped'` is a transient, non-terminal status (the dev pod was idle-scaled down mid-poll;
 * the backend already kicked it back awake) — `TemporalDebugAdapter` keeps polling through it rather
 * than treating it as a `TDebugEvent`.
 */
export interface IApiDebugSessionSnapshot {
  readonly status: 'running' | 'paused' | 'runner-stopped' | TDebugTerminationReason;
  readonly location: IDebugLocation | null;
  readonly variables: readonly IDebugVariable[];
  readonly reason: TDebugPauseReason | null;
  readonly message?: string;
}

/**
 * `POST /projects/:id/agent/chat` — the `HttpLlmClient`'s request/response, mirroring `@falang/agent`'s
 * `ILlmClient.complete()` shapes directly (its types are reused here rather than redeclared, since the
 * client already depends on `@falang/agent`; see ADR 0009 (private)). No
 * `credentialId`/`model` — the agent is configured app-wide by an admin, not per project; see
 * ADR 0031 (private).
 */
export interface IApiAgentChatRequest {
  readonly system: string;
  readonly messages: readonly TLlmMessage[];
  readonly tools: readonly ILlmToolDefinition[];
}

export type IApiAgentChatResult = ILlmResponse;

/**
 * `GET /agent/settings` — whether an admin has configured the app-wide agent (never the model, base URL or
 * key). See ADR 0031 (private).
 */
/**
 * `GET /projects/:id/schedules` — one entry per Temporal Schedule reconciled for this project, dev and
 * prod alike (a project with both a dev build and a published version can have two entries for the
 * same bound document, one per `env`) — mirrors `@falang/workflow-backend`'s own `IApiSchedule`
 * (`domains/build/build/api-schedule.ts`) verbatim, duplicated here per this package's usual pattern for
 * `IApi*` response shapes rather than importing across the client/backend boundary (see
 * `IApiWorkflowRunSummary` for the same pattern). See ADR 0037 (private) §7 — the
 * read-only `trigger-function-body` block's schedule status line.
 */
export interface IApiSchedule {
  readonly documentId: string;
  readonly env: 'dev' | 'prod';
  readonly scheduleId: string;
  readonly paused: boolean;
  /** ISO-8601 timestamps, soonest first. */
  readonly nextFireTimes: readonly string[];
  /** ISO-8601, or `null` if this schedule has never fired yet. */
  readonly lastFireTime: string | null;
  readonly skippedOverlapCount: number;
  readonly missedCatchupCount: number;
}

export interface IApiAgentSettingsStatus {
  readonly configured: boolean;
  /** How the in-app agent edits documents (ADR 0062 (private)). */
  readonly interface: 'json' | 'nodes';
}

/** One diagnostic of `POST /projects/:id/agent/check-project`. */
export interface IApiAgentCheckDiagnostic {
  readonly documentId?: string;
  readonly nodeId?: string;
  readonly message: string;
}

/**
 * One project-scoped file — uploaded by a user via the Files tab below, or produced/consumed by a
 * run's own `files`-vendor nodes (ADR 0038 (private) §7). Distinct from
 * the shared `files/File` struct (`IFileRef`, `{ id, name, size, mime, publicUrl? }`) an integration
 * node's compiled code passes around — this is the full `GET /projects/:id/files` row shape, mirroring
 * `@falang/workflow-backend`'s own response verbatim (same "duplicated here, not imported across the
 * client/backend boundary" pattern as `IApiSchedule`/`IApiWorkflowRunSummary` above).
 */
export interface IApiFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly publicUrl: string | null;
}

/** `GET /projects/:id/files` response — the file list plus this project owner's storage quota/usage. See ADR 0038 (private) §7. */
export interface IApiFilesList {
  readonly files: readonly IApiFile[];
  readonly usage: {
    readonly usedBytes: number;
    readonly maxProjectFilesBytes: number;
    readonly maxFileBytes: number;
  };
}

/** A `human-task` node's resolution answer carries an optional typed value alongside its label — see ADR 0040 (private) §5, mirroring `call-ai-choice`'s own per-option `dataType`. */
export type TTaskOptionDataType = 'void' | 'string' | 'number' | 'boolean';

export interface ITaskOption {
  readonly label: string;
  readonly dataType: TTaskOptionDataType;
  readonly prompt?: string;
}

export type TTaskStatus = 'open' | 'done' | 'expired' | 'cancelled' | 'orphaned';

/**
 * One human-in-the-loop task row (ADR 0040 (private)) — created by a
 * `human-task` node's ask-activity, resolved by the project owner from the Tasks page (or a public
 * `/t/<token>` link, not modeled client-side here) via `POST /tasks/:id/resolve`. `'orphaned'` means
 * the resolving signal couldn't reach the run any more (`orphanReason` explains why) — mirrors
 * `@falang/workflow-backend`'s own response shape verbatim, same "duplicated here, not imported
 * across the client/backend boundary" pattern as `IApiFile`/`IApiSchedule` above.
 */
export interface IApiTask {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly env: 'dev' | 'prod';
  readonly workflowId: string;
  readonly runId: string;
  readonly taskQueue: string;
  readonly nodeId: string;
  readonly title: string;
  readonly description: string;
  readonly payload: unknown;
  readonly attachments: readonly { id: string; name: string; size: number; mime: string; publicUrl?: string }[];
  readonly options: readonly ITaskOption[];
  readonly status: TTaskStatus;
  readonly answer: string | null;
  readonly answerData: unknown;
  readonly resolvedBy: string | null;
  readonly createdAt: string;
  readonly dueAt: string | null;
  readonly resolvedAt: string | null;
  readonly orphanReason: string | null;
}

/**
 * One configured integration instance's backend-written, non-secret data — keyed by an
 * `IWorkflowIntegration.syncVendorData`-defined key (today, always just `'schema'`), each value the
 * exact shape that hook returned (e.g. `sql-common`'s `ISyncedSchema`, `{ syncedAt, dialect, tables }`)
 * — see `GET`/`POST /projects/:id/integrations/:credentialId/(vendor-data|sync-schema)` and
 * ADR 0039 (private) §4. Kept as a bare `Record` (not a typed `ISyncedSchema`
 * import) since this client has no dependency on any one vendor's vendor-data shape — `VendorDataStore`
 * reads `schema.syncedAt`/`schema.tables` defensively for display, and `IWorkflowIntegration.instanceTypes`
 * is what actually interprets a vendor's own keys into struct types.
 */
export type IApiVendorData = Record<string, Record<string, unknown>>;

/** A message of the user ↔ administrator support chat (`/support/messages`, `/admin/support/threads/:userId/messages`). */
export interface IApiSupportMessage {
  readonly id: string;
  readonly userId: string;
  readonly authorRole: 'user' | 'admin';
  readonly authorId: string;
  readonly text: string;
  readonly createdAt: string;
  readonly readAt: string | null;
}
