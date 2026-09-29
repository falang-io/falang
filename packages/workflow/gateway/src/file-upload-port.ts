import type { IFileRefLike, IUploadFileMeta } from '@falang/workflow-integrations-common';

/**
 * DI token for `IFileUploadPort` — mirrors `schedule-client.ts`'s `SCHEDULE_CLIENT_PORT` (see that
 * file's own doc comment for why `IntegrationsRuntimeService` takes this as a constructor param
 * rather than resolving it itself). Register with `{ provide: FILE_UPLOAD_PORT, useFactory: ... }`,
 * inject with `@Inject(FILE_UPLOAD_PORT)`. See ADR 0038 (private) §2/§5.
 */
export const FILE_UPLOAD_PORT = Symbol('FILE_UPLOAD_PORT');

/**
 * The object-storage-facing half of `IIntegrationBackendContext.uploadFile` (see
 * `@falang/workflow-integrations-common`'s `backend-runtime.ts`) — implemented in `backend` over its
 * own `FilesService` (the same internal file API a runner pod's activities call over HTTP, see
 * `@falang/workflow-integrations-files`'s `activity-helpers.ts`), so vendor packages never depend on
 * that service directly. Wired into `IntegrationsRuntimeService` via
 * `IIntegrationsRuntimeParams.fileUpload` — omitted only by a host that doesn't wire it up (e.g. a
 * bare `forRoot` in a test, or a host with no vendor that needs it), in which case `ctx.uploadFile()`
 * throws, the same posture `upsertSchedule` already has without a `scheduleClient`.
 */
export interface IFileUploadPort {
  upload(
    projectId: string,
    source: ReadableStream<Uint8Array> | Uint8Array,
    meta: IUploadFileMeta,
  ): Promise<IFileRefLike>;
}
