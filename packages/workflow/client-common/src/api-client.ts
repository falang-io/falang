// oxlint-disable max-lines -- grew past 300 lines from ADR 0025 (private)'s version-history endpoints and ADR 0029 (private)'s document-lock error handling landing in the same merge; both additions are small, not accumulated complexity.
import type { INode } from '@falang/dto';
import type { ICommitInfo, IProjectSnapshot, TCommitKind } from '@falang/versioning';
import type { IActivepiecesPieceCatalogEntry } from '@falang/workflow-integrations-activepieces';
import type { IFieldSelectOption } from '@falang/workflow-integrations-common';
import { ApiCompileErrorsError, type IApiCompileError, type IApiCompileErrorFile } from './api-compile-error.js';
import { AgentQuotaError } from './agent/agent-quota-error.js';
import { ApiCodedError } from './api-coded-error.js';
import { DocumentLockedError } from './api-document-lock-error.js';
import type { IDebugLocation } from '@falang/debug';
import type {
  IApiAgentChatRequest,
  IApiAgentChatResult,
  IApiAgentCheckDiagnostic,
  IApiAgentSettingsStatus,
  IApiBuildResult,
  IApiDebugSessionSnapshot,
  IApiDocumentLock,
  IApiFile,
  IApiFilesList,
  IApiFunctionSignature,
  IApiGeneratedFile,
  IApiApplicationInput,
  IApiAuthConfig,
  IApiLoginResult,
  IApiOpenSignupInput,
  IApiPersonalAccessToken,
  IApiProject,
  IApiProjectTemplate,
  IApiProjectDocument,
  IApiProjectExport,
  IApiProjectTree,
  IApiProjectVersion,
  IApiRunFunctionResult,
  IApiSchedule,
  IApiStartedDebugSession,
  IApiStartedRun,
  IApiSupportMessage,
  IApiTask,
  IApiUser,
  IApiVendorData,
  IApiWorkflowPosition,
  IApiWorkflowRunDetail,
  IApiWorkflowRunFilters,
  IApiWorkflowRunSummary,
  ICreatedApiPersonalAccessToken,
  TApiRunTarget,
  TTaskStatus,
} from './api-types.js';

export { ApiCompileErrorsError, type IApiCompileError, type IApiCompileErrorFile } from './api-compile-error.js';
export { DocumentLockedError } from './api-document-lock-error.js';
export { AgentQuotaError } from './agent/agent-quota-error.js';
export * from './api-types.js';

const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

/** Needed to verify a `postMessage` from the OAuth2 callback popup really came from our own backend — see `oauth2-popup.ts`. */
export const getBackendOrigin = (): string => new URL(BACKEND_URL).origin;
const TOKEN_STORAGE_KEY = 'falang-workflow-token';

let token: string | null = localStorage.getItem(TOKEN_STORAGE_KEY);
let onUnauthorized: (() => void) | null = null;

/** Called once by `AuthStore` so `request()` can react to a 401 (e.g. an expired token) without a circular import. */
export const setUnauthorizedHandler = (handler: () => void): void => {
  onUnauthorized = handler;
};

export const setAuthToken = (nextToken: string | null): void => {
  token = nextToken;
  if (nextToken) localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
};

export const getAuthToken = (): string | null => token;

const throwIfCoded = (message: string | undefined, body: { code?: string } | null): void => {
  if (typeof body?.code === 'string') throw new ApiCodedError(message ?? body.code, body.code);
};

const throwIfQuotaExceeded = (status: number, message: string | undefined, body: unknown): void => {
  if (status === 402) throw new AgentQuotaError(message ?? 'Payment required', body);
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as object) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    onUnauthorized?.();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      errors?: IApiCompileError[];
      files?: IApiCompileErrorFile[];
      lockExpiresAt?: string;
      code?: string;
    } | null;
    // `BuildService.compileProjectDocuments` sends `{ message, errors, files }` for a failed
    // compile — surfaced as its own error type so callers can render the per-document list
    // together with the compiled-or-partially-compiled code.
    if (body?.errors) {
      throw new ApiCompileErrorsError(body.errors, body.files ?? []);
    }
    // `DocumentsService.assertNotLockedByAnotherOwner` sends `{ message, lockExpiresAt }` on a 409 —
    // see ADR 0029 (private)'s "Document locks" decision. `documentId` is
    // filled in by `updateDocument`/`deleteDocument` below (the only two calls this can come from),
    // not known at this generic layer.
    if (response.status === 409 && typeof body?.lockExpiresAt === 'string') {
      throw new DocumentLockedError('', body.lockExpiresAt);
    }
    // Nest's default HttpException body is `{ statusCode, message, error }` — `message` carries the
    // actual text (a string, or a string[] for class-validator failures); `error` is just the
    // generic HTTP status phrase (e.g. "Unauthorized"), not useful to show the user.
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    // 402 = the deployment refused the agent call for lack of credits (see `AgentQuotaError`).
    throwIfQuotaExceeded(response.status, message, body);
    // A machine-readable `code` (e.g. login's `not_activated`) lets the UI pick its own wording.
    throwIfCoded(message, body);
    throw new Error(message ?? `${init?.method ?? 'GET'} ${path} failed`);
  }
  // Some 2xx responses (e.g. a 202 with a void handler) have no body at all — not just 204s.
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
};

/**
 * The generic request helper above, exported for `@falang/workflow-client-admin` — its `/admin/*`
 * calls need the same token handling (`Authorization` header, 401 → logout, error-body parsing) as
 * every `workflowApi` call, without duplicating it. See
 * ADR 0030 (private).
 */
export const apiRequest = request;

/**
 * Like `request()` above, but for the non-JSON bodies the Files API (ADR 0038 (private) §7) uses on both ends: no
 * `Content-Type: application/json` is forced onto the request (an upload sends its own `content-type`/`x-file-name`
 * headers over a raw `File` body), and the response is handed back unparsed (a download reads it as a `Blob`; a write
 * reads it as JSON itself) rather than this helper assuming every response is JSON. Auth/401/error-body handling mirror
 * `request()` exactly.
 */
const requestRaw = async (path: string, init?: RequestInit): Promise<Response> => {
  const headers: Record<string, string> = { ...(init?.headers as object) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    onUnauthorized?.();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new Error(message ?? `${init?.method ?? 'GET'} ${path} failed`);
  }
  return response;
};

export const workflowApi = {
  login: (username: string, password: string) =>
    request<IApiLoginResult>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  authConfig: () => request<IApiAuthConfig>('/auth/config'),

  register: (input: IApiOpenSignupInput) =>
    request<IApiLoginResult>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  /** Closed-beta application (`signupMode: 'application'`): 202, no token — the user must confirm the e-mail first. */
  apply: (input: IApiApplicationInput) =>
    request<{ status: 'pending_email' }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  verifyEmail: (verificationToken: string) =>
    request<{ status: 'pending_activation' | 'active' }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: verificationToken }),
    }),

  /** Always 202, whether or not the address exists. */
  resendVerification: (email: string) =>
    request<null>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),

  forgotPassword: (email: string, captchaToken = '') =>
    request<null>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(captchaToken ? { email, captchaToken } : { email }),
    }),

  resetPassword: (resetToken: string, password: string) =>
    request<null>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken, password }) }),

  /** `400` on a wrong current password or a too-short new one (never 401, which would log the user out). */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<null>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

  me: () => request<IApiUser>('/auth/me'),

  updateLanguage: (language: string) =>
    request<IApiUser>('/auth/me', { method: 'PATCH', body: JSON.stringify({ language }) }),

  /** Never returns `tokenHash`/the raw secret — see `IApiPersonalAccessToken`. */
  listPersonalAccessTokens: () => request<IApiPersonalAccessToken[]>('/auth/tokens'),

  /** The only response that ever carries the raw `flg_pat_…` secret. */
  createPersonalAccessToken: (input: { name: string; projectId?: string; expiresInDays?: number }) =>
    request<ICreatedApiPersonalAccessToken>('/auth/tokens', { method: 'POST', body: JSON.stringify(input) }),

  revokePersonalAccessToken: (id: string) => request<null>(`/auth/tokens/${id}`, { method: 'DELETE' }),

  listProjects: () => request<IApiProject[]>('/projects'),

  createProject: (name: string) =>
    request<IApiProject>('/projects', { method: 'POST', body: JSON.stringify({ name }) }),

  deleteProject: (projectId: string) => request<null>(`/projects/${projectId}`, { method: 'DELETE' }),

  exportProject: (projectId: string) => request<IApiProjectExport>(`/projects/${projectId}/export`),

  listProjectTemplates: () => request<IApiProjectTemplate[]>('/project-templates'),

  createProjectFromTemplate: (templateId: string, name: string) =>
    request<IApiProject>(`/projects/from-template/${templateId}`, { method: 'POST', body: JSON.stringify({ name }) }),

  importProject: (payload: IApiProjectExport) =>
    request<IApiProject>('/projects/import', { method: 'POST', body: JSON.stringify(payload) }),

  getProjectTree: (projectId: string) => request<IApiProjectTree>(`/projects/${projectId}/tree`),

  getProjectDocuments: (projectId: string) => request<IApiProjectDocument[]>(`/projects/${projectId}/documents`),

  /** Active document locks — see `DocumentLocksStore`, which polls this every 5s while a project workspace is open. */
  getDocumentLocks: (projectId: string) => request<IApiDocumentLock[]>(`/projects/${projectId}/documents/locks`),

  /** Schedule state for every `trigger-function` bound to a `schedule-*` trigger — see `ScheduleStatusStore`, which polls this every 30s while the project has at least one such document. Docs/decisions/0037-schedule-triggers.md §7. */
  listSchedules: (projectId: string) => request<IApiSchedule[]>(`/projects/${projectId}/schedules`),

  /**
   * Acquires/renews a lock the calling tab holds on `documentId` for as long as the agent has that
   * document's `Scheme` open — see `WorkflowStore`'s `documentResolverFor` and
   * ADR 0034 (private) §2.4. Same owner renews rather than
   * conflicting; a different active owner throws (a normal thrown `Error`, not `DocumentLockedError`
   * — this call isn't a content save, so there's no in-memory edit to preserve for a later retry).
   */
  lockDocument: (projectId: string, documentId: string, owner: string, ttlMs?: number) =>
    request<IApiDocumentLock>(`/projects/${projectId}/documents/${documentId}/lock`, {
      method: 'POST',
      body: JSON.stringify({ owner, ttlMs }),
    }),

  /** Releases a lock this tab holds — see `lockDocument` above. */
  unlockDocument: (projectId: string, documentId: string, owner: string) =>
    request<null>(`/projects/${projectId}/documents/${documentId}/lock`, {
      method: 'DELETE',
      body: JSON.stringify({ owner }),
    }),

  createFolder: (projectId: string, input: { id: string; name: string; parentId: string | null }) =>
    request(`/projects/${projectId}/folders`, { method: 'POST', body: JSON.stringify(input) }),

  updateFolder: (projectId: string, folderId: string, input: { name?: string; parentId?: string | null }) =>
    request(`/projects/${projectId}/folders/${folderId}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteFolder: (projectId: string, folderId: string) =>
    request<null>(`/projects/${projectId}/folders/${folderId}`, { method: 'DELETE' }),

  createDocument: (projectId: string, input: IApiProjectDocument & { folderId: string | null }) =>
    request<IApiProjectDocument>(`/projects/${projectId}/documents`, { method: 'POST', body: JSON.stringify(input) }),

  /** Re-thrown with the real `documentId` filled in — see `DocumentLockedError`, whose `documentId` `request()` itself can't know. */
  updateDocument: (
    projectId: string,
    documentId: string,
    input: {
      name?: string;
      folderId?: string | null;
      root?: INode | null;
      data?: unknown;
      /** This tab's own agent-lock owner id, if it holds one on this document — see `lockDocument` below and ADR 0034 §2.4. */
      lockOwner?: string;
    },
  ) =>
    request<IApiProjectDocument>(`/projects/${projectId}/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }).catch((error: unknown) => {
      if (error instanceof DocumentLockedError) throw new DocumentLockedError(documentId, error.lockExpiresAt);
      throw error;
    }),

  /** Re-thrown with the real `documentId` filled in — see `updateDocument` above. */
  deleteDocument: (projectId: string, documentId: string) =>
    request<null>(`/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' }).catch((error: unknown) => {
      if (error instanceof DocumentLockedError) throw new DocumentLockedError(documentId, error.lockExpiresAt);
      throw error;
    }),

  getCode: (projectId: string) => request<IApiGeneratedFile[]>(`/projects/${projectId}/code`),

  build: (projectId: string) => request<IApiBuildResult>(`/projects/${projectId}/build`, { method: 'POST' }),

  listFunctions: (projectId: string) => request<IApiFunctionSignature[]>(`/projects/${projectId}/functions`),

  runFunction: (projectId: string, input: { functionName: string; target: TApiRunTarget; args: unknown[] }) =>
    request<IApiRunFunctionResult>(`/projects/${projectId}/run`, { method: 'POST', body: JSON.stringify(input) }),

  /** The toolbar's "Run" button — starts a dev execution and returns its ids right away, see `getRunPosition`. */
  startDevRun: (
    projectId: string,
    input: { functionName: string; args: unknown[]; triggerPayload?: Record<string, unknown> },
  ) => request<IApiStartedRun>(`/projects/${projectId}/runs`, { method: 'POST', body: JSON.stringify(input) }),

  /** Polled while a run is watched — where the execution currently is in its diagram. */
  getRunPosition: (projectId: string, workflowId: string, runId: string) =>
    request<IApiWorkflowPosition>(`/projects/${projectId}/runs/${workflowId}/${runId}/position`),

  /** Starts a dev debug session with the given breakpoints armed — see `TemporalDebugAdapter`. */
  startDebugSession: (
    projectId: string,
    input: {
      functionName: string;
      args: unknown[];
      breakpoints: IDebugLocation[];
      pauseOnEntry: boolean;
      triggerPayload?: Record<string, unknown>;
    },
  ) =>
    request<IApiStartedDebugSession>(`/projects/${projectId}/debug/start`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Polled every 500ms while a debug session is running/paused. */
  getDebugState: (projectId: string, workflowId: string) =>
    request<IApiDebugSessionSnapshot>(`/projects/${projectId}/debug/${workflowId}/state`),

  setDebugBreakpoints: (projectId: string, workflowId: string, breakpoints: IDebugLocation[]) =>
    request<null>(`/projects/${projectId}/debug/${workflowId}/breakpoints`, {
      method: 'POST',
      body: JSON.stringify({ breakpoints }),
    }),

  resumeDebugSession: (projectId: string, workflowId: string, mode: 'continue' | 'step-over') =>
    request<null>(`/projects/${projectId}/debug/${workflowId}/resume`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  stopDebugSession: (projectId: string, workflowId: string) =>
    request<null>(`/projects/${projectId}/debug/${workflowId}/stop`, { method: 'POST' }),

  stop: (projectId: string) => request<null>(`/projects/${projectId}/stop`, { method: 'POST' }),

  /** Restores the dev Build/Stop toolbar state on page load — mirrors `getProdStatus` below, for the dev runner. */
  getDevStatus: (projectId: string) =>
    request<{ running: boolean; taskQueue: string }>(`/projects/${projectId}/build/status`),

  publish: (projectId: string) => request<IApiProjectVersion>(`/projects/${projectId}/publish`, { method: 'POST' }),

  listVersions: (projectId: string) => request<IApiProjectVersion[]>(`/projects/${projectId}/versions`),

  activateVersion: (projectId: string, versionNumber: number) =>
    request<null>(`/projects/${projectId}/versions/${versionNumber}/activate`, { method: 'POST' }),

  stopVersion: (projectId: string, versionNumber: number) =>
    request<null>(`/projects/${projectId}/versions/${versionNumber}/stop`, { method: 'POST' }),

  deleteVersion: (projectId: string, versionNumber: number) =>
    request<null>(`/projects/${projectId}/versions/${versionNumber}`, { method: 'DELETE' }),

  /** Project-wide Start/Stop toggle for prod — distinct from the per-version `activateVersion`/`stopVersion` above. */
  getProdStatus: (projectId: string) => request<{ running: boolean }>(`/projects/${projectId}/versions/status`),

  startProd: (projectId: string) => request<null>(`/projects/${projectId}/versions/start`, { method: 'POST' }),

  stopProd: (projectId: string) => request<null>(`/projects/${projectId}/versions/stop`, { method: 'POST' }),

  listWorkflowRuns: (filters?: IApiWorkflowRunFilters) => {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.workflowName) params.set('workflowName', filters.workflowName);
    if (filters?.version) params.set('version', filters.version);
    if (filters?.buildId) params.set('buildId', filters.buildId);
    const query = params.toString();
    return request<IApiWorkflowRunSummary[]>(`/workflow-runs${query ? `?${query}` : ''}`);
  },

  terminateWorkflowRun: (projectId: string, workflowId: string, runId: string) =>
    request<null>(`/projects/${projectId}/runs/${workflowId}/${runId}/terminate`, { method: 'POST' }),

  getWorkflowRunDetail: (workflowId: string, runId: string) =>
    request<IApiWorkflowRunDetail>(`/workflow-runs/${workflowId}/${runId}`),

  /** Backs any `kind: 'select'` field's `loadOptions` (e.g. `call-ai-text`'s `model`) — see `TOKEN_FIELD_OPTIONS_PROVIDER`. */
  loadIntegrationFieldOptions: (projectId: string, credentialId: string, actionName: string, fieldName: string) =>
    request<IFieldSelectOption[]>(
      `/projects/${projectId}/integrations/${credentialId}/actions/${actionName}/fields/${fieldName}/options`,
    ),

  /** Not project-scoped — piece metadata is global, not tied to any one project. See `TOKEN_ACTIVEPIECES_CATALOG_PROVIDER`. */
  loadActivepiecesPieces: () => request<IActivepiecesPieceCatalogEntry[]>('/activepieces/pieces'),

  /** Backs `DROPDOWN`/`MULTI_SELECT_DROPDOWN` ActivePieces props — see `TOKEN_ACTIVEPIECES_FIELD_OPTIONS_PROVIDER`. */
  loadActivepiecesFieldOptions: (
    projectId: string,
    credentialId: string,
    pieceName: string,
    actionName: string,
    fieldName: string,
    propsValue: Readonly<Record<string, unknown>>,
  ) =>
    request<IFieldSelectOption[]>(
      `/projects/${projectId}/activepieces/credentials/${credentialId}/pieces/${pieceName}/actions/${actionName}/fields/${fieldName}/options?propsValue=${encodeURIComponent(JSON.stringify(propsValue))}`,
    ),

  /** Starts an OAuth2 "Connect" flow — returns the vendor's consent-screen URL to open in a popup. See `oauth2-popup.ts`. */
  startOAuth2Authorization: (projectId: string, credentialId: string) =>
    request<{ authorizeUrl: string }>(`/projects/${projectId}/integrations/${credentialId}/oauth2/start`, {
      method: 'POST',
    }),

  /**
   * Every backend-written key stored for one configured instance (today, just `'schema'`) — see
   * `VendorDataStore.loadAll`/ADR 0039 (private) §4. An instance with
   * nothing synced yet (or one that never existed) returns `{}`, not a 404.
   */
  getIntegrationVendorData: (projectId: string, credentialId: string) =>
    request<IApiVendorData>(`/projects/${projectId}/integrations/${credentialId}/vendor-data`),

  /**
   * "Sync structure" — connects to the instance's vendor with its resolved **dev** credential fields
   * (`IWorkflowIntegration.syncVendorData`) and persists whatever it returns, keyed the same way
   * `getIntegrationVendorData` reads it back. Returns the full, now-updated vendor-data record for the
   * instance so `VendorDataStore.sync` doesn't need a separate follow-up `GET`.
   */
  syncIntegrationSchema: (projectId: string, credentialId: string) =>
    request<IApiVendorData>(`/projects/${projectId}/integrations/${credentialId}/sync-schema`, { method: 'POST' }),

  /**
   * Backs `HttpLlmClient` — proxies one `@falang/agent` tool-calling turn to the app-wide agent
   * settings an admin configured (ADR 0031 (private));
   * `412` when nothing is configured yet.
   */
  agentChat: (projectId: string, input: IApiAgentChatRequest, signal?: AbortSignal) =>
    request<IApiAgentChatResult>(`/projects/${projectId}/agent/chat`, {
      body: JSON.stringify(input),
      method: 'POST',
      signal,
    }),

  /** Whether the app-wide agent is configured, and which model it uses — see the ADR above. Any signed-in user. */
  getAgentSettings: () => request<IApiAgentSettingsStatus>('/agent/settings'),

  /**
   * The agent's `check_project`: compiles + type-checks the project server-side. `documents` are the
   * CURRENT trees the client holds (autosave is debounced), overlaid on the stored ones. ADR 0062 (private).
   */
  checkAgentProject: async (
    projectId: string,
    documents: readonly { readonly id: string; readonly root: unknown }[],
  ): Promise<IApiAgentCheckDiagnostic[]> => {
    const result = await request<{ diagnostics: IApiAgentCheckDiagnostic[] }>(
      `/projects/${projectId}/agent/check-project`,
      { body: JSON.stringify({ documents }), method: 'POST' },
    );
    return result.diagnostics;
  },

  /** Backs `HttpVersionStore` — see ADR 0025 (private). */
  listCommits: (projectId: string) => request<ICommitInfo[]>(`/projects/${projectId}/commits`),

  /**
   * Snapshots the working copy and commits it — `null` (no new commit) when nothing changed since
   * `HEAD`. The shared `request()` helper above already turns an empty 2xx body into `null` for any
   * caller (Nest's `isNil(body)` sends a bodyless response for a `null` return value, see
   * `versioning.controller.ts`'s own note), so no special-casing is needed here.
   */
  createCommit: (projectId: string, input: { kind: TCommitKind; message: string }) =>
    request<ICommitInfo | null>(`/projects/${projectId}/commits`, { method: 'POST', body: JSON.stringify(input) }),

  getCommitSnapshot: (projectId: string, commitId: string) =>
    request<IProjectSnapshot>(`/projects/${projectId}/commits/${commitId}`),

  nameCommit: (projectId: string, commitId: string, message: string) =>
    request<ICommitInfo>(`/projects/${projectId}/commits/${commitId}`, {
      method: 'PATCH',
      body: JSON.stringify({ message }),
    }),

  restoreCommit: (projectId: string, commitId: string) =>
    request<ICommitInfo>(`/projects/${projectId}/commits/${commitId}/restore`, { method: 'POST' }),

  /** Backs the "Files" tab (ADR 0038 (private) §7) — see `FilesStore`. */
  listFiles: (projectId: string) => request<IApiFilesList>(`/projects/${projectId}/files`),

  /**
   * Uploads a raw browser `File` — a plain byte stream, not multipart, per the internal-API contract
   * `POST /internal/files/:projectId` also uses. `ttlHours` (optional) becomes `x-file-ttl-seconds`,
   * rounded to whole seconds; omitted, the backend falls back to its own default-TTL rules.
   */
  uploadFile: (projectId: string, file: File, ttlHours?: number | null) => {
    const headers: Record<string, string> = {
      'content-type': file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
    };
    if (typeof ttlHours === 'number') headers['x-file-ttl-seconds'] = String(Math.round(ttlHours * 3600));
    return requestRaw(`/projects/${projectId}/files`, { method: 'POST', headers, body: file }).then(
      (response) => response.json() as Promise<IApiFile>,
    );
  },

  /** Not authenticated on its own (no `Authorization` header reaches a plain `<a href>`/`<img src>`) — only useful for display/debugging; a real download goes through `downloadFile` below. */
  downloadFileUrl: (projectId: string, fileId: string) => `${BACKEND_URL}/projects/${projectId}/files/${fileId}`,

  /** Fetches the file's bytes as a `Blob`, carrying the `Authorization` header `downloadFileUrl` can't. */
  downloadFile: (projectId: string, fileId: string) =>
    requestRaw(`/projects/${projectId}/files/${fileId}`).then((response) => response.blob()),

  deleteFile: (projectId: string, fileId: string) =>
    request<null>(`/projects/${projectId}/files/${fileId}`, { method: 'DELETE' }),

  /** Idempotent — a file already published gets back the same `publicUrl`. */
  publishFile: (projectId: string, fileId: string) =>
    request<IApiFile>(`/projects/${projectId}/files/${fileId}/publish`, { method: 'POST' }),

  unpublishFile: (projectId: string, fileId: string) =>
    request<IApiFile>(`/projects/${projectId}/files/${fileId}/publish`, { method: 'DELETE' }),

  /**
   * Human-in-the-loop tasks (ADR 0040 (private)) — owner-scoped, across
   * every project the caller owns; `filters.projectId` only narrows within those. See `TasksStore`.
   */
  listTasks: (filters?: { status?: TTaskStatus; projectId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.projectId) params.set('projectId', filters.projectId);
    const query = params.toString();
    return request<IApiTask[]>(`/tasks${query ? `?${query}` : ''}`);
  },

  getTask: (id: string) => request<IApiTask>(`/tasks/${id}`),

  /** `400` if `answer` isn't one of the task's own `options[].label`, or `data` doesn't match that option's `dataType`; `409` if the task isn't `open` any more. */
  resolveTask: (id: string, input: { answer: string; data?: string | number | boolean }) =>
    request<IApiTask>(`/tasks/${id}/resolve`, { method: 'POST', body: JSON.stringify(input) }),

  /** The signed-in user's own support thread; `after` (ISO) returns only messages created strictly after it. */
  listSupportMessages: (after?: string | null) =>
    request<IApiSupportMessage[]>(`/support/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),

  sendSupportMessage: (text: string) =>
    request<IApiSupportMessage>('/support/messages', { method: 'POST', body: JSON.stringify({ text }) }),

  markSupportRead: () => request<null>('/support/messages/read', { method: 'POST' }),

  getSupportUnread: () => request<{ count: number }>('/support/unread'),
};
