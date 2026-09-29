import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as TNodeReadableStream } from 'node:stream/web';
import type { IFileRef, TWorkflowEnv } from '../types.js';

/** Node's `stream/web` and TypeScript's `dom` lib each declare their own, structurally-almost-but-
 * not-quite-identical global `ReadableStream` — `lib.dom.d.ts` is in this repo's shared
 * `tsconfig.base.json` (every package needs it for React), so the global `fetch`/`Response` types
 * resolve to the `dom` ones. This alias is the one place that mismatch is bridged with an explicit
 * cast, rather than sprinkling `as unknown as` through the two calls below. */
type TDomReadableStream = ReadableStream<Uint8Array>;

export class FilesClientError extends Error {}

export interface IFilesClient {
  download(projectId: string, fileId: string, token: string, destPath: string): Promise<void>;
  upload(
    projectId: string,
    token: string,
    filePath: string,
    fileName: string,
    contentType: string,
    createdBy: string,
    workflowEnv: TWorkflowEnv | undefined,
    ttlSeconds: number | undefined,
  ): Promise<IFileRef>;
}

/** Every request the media service makes back to `backend` carries the *caller's* project token
 * (`x-internal-project-token`) — this service never holds a token of its own, so a wrong/expired
 * one just makes the underlying `backend` call fail (401/403), which the job-runner turns into a
 * failed job rather than anything it tries to interpret itself. See ADR 0041 (private) §1. */
export const createFilesClient = (backendInternalUrl: string, fetchFn: typeof fetch = fetch): IFilesClient => ({
  download: async (projectId, fileId, token, destPath) => {
    const response = await fetchFn(`${backendInternalUrl}/internal/files/${projectId}/${fileId}`, {
      headers: { 'x-internal-project-token': token },
    });
    if (!response.ok || response.body === null) {
      throw new FilesClientError(`failed to download file ${fileId}: ${response.status} ${await response.text()}`);
    }
    await pipeline(Readable.fromWeb(response.body as unknown as TNodeReadableStream), createWriteStream(destPath));
  },

  upload: async (projectId, token, filePath, fileName, contentType, createdBy, workflowEnv, ttlSeconds) => {
    const headers: Record<string, string> = {
      'x-internal-project-token': token,
      'x-file-name': fileName,
      'content-type': contentType,
      'x-created-by': createdBy,
    };
    if (workflowEnv) headers['x-workflow-env'] = workflowEnv;
    if (ttlSeconds) headers['x-file-ttl-seconds'] = String(ttlSeconds);

    // `duplex: 'half'` is required by the fetch spec whenever `body` is a stream rather than a
    // buffered value — same requirement `@falang/workflow-integrations-files`'s activity helpers
    // hit streaming *into* this same internal file API (see ADR 0038 (private) §2).
    const requestInit: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers,
      body: Readable.toWeb(createReadStream(filePath)) as unknown as TDomReadableStream,
      duplex: 'half',
    };
    const response = await fetchFn(`${backendInternalUrl}/internal/files/${projectId}`, requestInit);
    if (!response.ok) {
      throw new FilesClientError(`failed to upload file ${fileName}: ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as IFileRef;
  },
});
