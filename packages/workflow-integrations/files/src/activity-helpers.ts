import type { IFileRef } from './file-types.js';

/**
 * Real, exported functions (not a `sharedActivityCode` string) — the runner resolves this whole
 * package from the monorepo's `node_modules` (npm workspaces), so an activity's own `activityCode`
 * can just `import { uploadFileFromStream, … } from '@falang/workflow-integrations-files';` instead
 * of duplicating this logic as TS source text, the way `telegram.integration.ts`'s
 * `resolveTelegramBotToken` does for its own vendor. See ADR 0038 (private)
 * §4 and `@falang/workflow-integrations-common`'s `oauth2-runtime.ts` for the same shape.
 *
 * This module is also part of the browser bundle (the package's `index.ts` re-exports everything,
 * and `@falang/workflow-client-common` depends on the package for `filesIntegration` itself) — no
 * `import 'node:*'`, no `process.env`/`Buffer` access at module scope. Every `process.env`/`Buffer`
 * read below happens inside a function body, only ever actually reached when a real runner process
 * calls it.
 */

interface IInternalFilesRequestInit {
  readonly method: string;
  readonly headers?: Record<string, string>;
  readonly body?: BodyInit;
  /** Node's `fetch` (undici) requires this when `body` is a `ReadableStream` — absent from the DOM
   *  lib's own `RequestInit` type, so `internalFilesRequest` threads it through as its own field
   *  rather than every call site casting `RequestInit` itself. */
  readonly duplex?: 'half';
}

/** `${BACKEND_INTERNAL_URL}/internal/files/${PROJECT_ID}<path>`, guarded by `x-internal-project-token` — see the ADR's §2/§4 and `packages/workflow-integrations/common/src/oauth2-runtime.ts`'s identical env-var contract. */
const internalFilesRequest = (path: string, init: IInternalFilesRequestInit): Promise<Response> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;
  const projectId = process.env.PROJECT_ID;
  if (!backendUrl || !internalProjectToken || !projectId) {
    throw new Error(
      'BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process',
    );
  }
  const headers = { ...init.headers, 'x-internal-project-token': internalProjectToken };
  const fetchInit = { method: init.method, headers, body: init.body, duplex: init.duplex } as RequestInit & {
    duplex?: 'half';
  };
  return fetch(`${backendUrl}/internal/files/${projectId}${path}`, fetchInit);
};

/**
 * `POST /internal/files/:projectId` — streams `stream` straight through (never buffered here).
 * `opts.createdBy` defaults to `'run:unknown'` (a workflow run should normally pass
 * `` `run:${workflowId}` ``, an ingress path `'ingress:<vendor>'`); `opts.ttlSeconds`, when set,
 * overrides the backend's own env/quota-derived TTL rule for this one file.
 */
export const uploadFileFromStream = async (
  stream: ReadableStream<Uint8Array> | Blob | Uint8Array,
  opts: { readonly name: string; readonly mime: string; readonly ttlSeconds?: number; readonly createdBy?: string },
): Promise<IFileRef> => {
  const headers: Record<string, string> = {
    'content-type': opts.mime || 'application/octet-stream',
    'x-file-name': encodeURIComponent(opts.name),
    'x-created-by': opts.createdBy ?? 'run:unknown',
  };
  if (typeof opts.ttlSeconds === 'number') headers['x-file-ttl-seconds'] = String(Math.floor(opts.ttlSeconds));
  const workflowEnv = process.env.WORKFLOW_ENV;
  if (workflowEnv) headers['x-workflow-env'] = workflowEnv;

  const response = await internalFilesRequest('', {
    method: 'POST',
    headers,
    body: stream as BodyInit,
    ...(stream instanceof ReadableStream ? { duplex: 'half' as const } : {}),
  });
  if (response.status === 413) {
    throw new Error(`Upload rejected: "${opts.name}" is over the project's file size/quota limit`);
  }
  if (!response.ok) {
    throw new Error(`Upload failed for "${opts.name}": ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as IFileRef;
};

/** `GET /internal/files/:projectId/:fileId` — the raw byte stream, for a caller that wants to re-stream it elsewhere (e.g. Telegram multipart) rather than load it whole. */
export const openFileStream = async (file: IFileRef): Promise<ReadableStream<Uint8Array>> => {
  const response = await internalFilesRequest(`/${file.id}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to open file ${file.id} ("${file.name}"): ${response.status} ${await response.text()}`);
  }
  if (!response.body) throw new Error(`Failed to open file ${file.id} ("${file.name}"): empty response body`);
  return response.body;
};

/** Loads a file's bytes wholesale — refuses (before fetching anything) when `file.size` already exceeds `maxBytes`, since the whole point is keeping it out of Temporal workflow/activity payload size limits. */
export const readFileBytes = async (file: IFileRef, maxBytes: number): Promise<Uint8Array> => {
  if (file.size > maxBytes) {
    throw new Error(
      `File "${file.name}" is ${file.size} bytes, over the ${maxBytes}-byte limit for reading into workflow state`,
    );
  }
  const response = await internalFilesRequest(`/${file.id}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to read file ${file.id} ("${file.name}"): ${response.status} ${await response.text()}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

/** `Buffer` (Node-global, not a browser global) is only touched inside this function body — never at module scope — so importing this module in a browser bundle is harmless as long as it's never called there. */
const bytesToBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** `data:<mime>;base64,<…>` — used to embed a small file inline (e.g. an OpenAI `image_url`/`file` content part, ADR 0038 (private) §6) rather than passing a URL a vendor's servers may not be able to reach. */
export const fileToDataUrl = async (file: IFileRef, maxBytes: number): Promise<string> => {
  const bytes = await readFileBytes(file, maxBytes);
  return `data:${file.mime};base64,${bytesToBase64(bytes)}`;
};

/** `GET /internal/files/:projectId/:fileId/meta` — re-hydrates a `File` from a bare id stored elsewhere (e.g. a DB row, per ADR 0039 (private)). */
export const getFileMeta = async (fileId: string): Promise<IFileRef> => {
  const response = await internalFilesRequest(`/${fileId}/meta`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to load metadata for file ${fileId}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as IFileRef;
};

/** `DELETE /internal/files/:projectId/:fileId`. */
export const deleteFile = async (file: IFileRef): Promise<void> => {
  const response = await internalFilesRequest(`/${file.id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Failed to delete file ${file.id} ("${file.name}"): ${response.status} ${await response.text()}`);
  }
};

/** `POST /internal/files/:projectId/:fileId/publish` — idempotent; re-publishing returns the same `publicUrl`. */
export const publishFile = async (file: IFileRef): Promise<IFileRef> => {
  const response = await internalFilesRequest(`/${file.id}/publish`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to publish file ${file.id} ("${file.name}"): ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as IFileRef;
};

/** `DELETE /internal/files/:projectId/:fileId/publish` — clears `public_token`; the file itself is unaffected. */
export const unpublishFile = async (file: IFileRef): Promise<IFileRef> => {
  const response = await internalFilesRequest(`/${file.id}/publish`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(
      `Failed to unpublish file ${file.id} ("${file.name}"): ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as IFileRef;
};
