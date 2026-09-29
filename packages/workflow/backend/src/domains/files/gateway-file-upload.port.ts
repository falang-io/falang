import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import type { IFileRefLike, IUploadFileMeta as IGatewayUploadFileMeta } from '@falang/workflow-integrations-common';
import type { IFileUploadPort } from '@falang/workflow-gateway';
import { toFileRef } from './file-ref-mapper.js';
import { FilesService } from './files.service.js';

/**
 * Implements `@falang/workflow-gateway`'s `IFileUploadPort` over this domain's own `FilesService` —
 * the object-storage-facing half of `IIntegrationBackendContext.uploadFile` (see
 * ADR 0038 (private) §2/§5 and the fixed phase-2 contract), so vendor
 * packages (Telegram media ingress today) never depend on `FilesService` directly, only on the
 * browser-safe `ctx.uploadFile()` contract. Registered under `FILE_UPLOAD_PORT` in `FilesModule` and
 * threaded into `GatewayModule.forRootAsync` in `app.module.ts` via `resolveFileUploadPort`.
 *
 * Converts the caller's web `ReadableStream<Uint8Array>`/`Uint8Array` into the Node `Readable`
 * `FilesService.upload` expects — same `Readable.fromWeb(... as never)` cast `S3FileStorage`/
 * `InMemoryFileStorage` already use for the same reason (Node's `streamWeb.ReadableStream` type
 * doesn't structurally match the DOM-lib `ReadableStream` this package's own signature is typed
 * against) — and narrows its `IApiFile` result down to the plain `IFileRefLike` shape via
 * `toFileRef`. `meta.createdBy`/`meta.ttlSeconds` pass through verbatim; `workflowEnv` is never set
 * here (only a runner-pod activity's own internal-API call sets it) — an ingress-created file's TTL
 * is decided purely from `createdBy` (e.g. `'ingress:telegram'`), per `file-ttl.ts`'s rule.
 */
@Injectable()
export class GatewayFileUploadPort implements IFileUploadPort {
  private readonly files: FilesService;

  constructor(@Inject(FilesService) files: FilesService) {
    this.files = files;
  }

  async upload(
    projectId: string,
    source: ReadableStream<Uint8Array> | Uint8Array,
    meta: IGatewayUploadFileMeta,
  ): Promise<IFileRefLike> {
    const stream = source instanceof Uint8Array ? Readable.from(source) : Readable.fromWeb(source as never);
    const apiFile = await this.files.upload(projectId, stream, {
      name: meta.name,
      mime: meta.mime,
      createdBy: meta.createdBy,
      ...(typeof meta.ttlSeconds === 'number' ? { ttlSeconds: meta.ttlSeconds } : {}),
    });
    return toFileRef(apiFile);
  }
}
