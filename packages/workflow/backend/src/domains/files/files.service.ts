import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, type Repository } from 'typeorm';
import { UserLimitsService } from '../admin/user-limits/user-limits.service.js';
import { Project } from '../projects/projects/project.entity.js';
import { FileTooLargeError } from './file-too-large-error.js';
import { FILE_STORAGE, type IFileStorage } from './file-storage.js';
import { generateFileId, generatePublicToken } from './file-id.js';
import { resolveExpiresAt } from './file-ttl.js';
import { File } from './file.entity.js';
import type { IApiFile, IFileRef, IProjectFilesListResponse, IUploadFileMeta } from './file.types.js';

export interface IOpenedFileStream {
  readonly file: File;
  readonly body: Readable;
  readonly contentLength?: number;
}

/**
 * See ADR 0038 (private) §2/§4 and the fixed phase-2 contract. Owns
 * the `files` table plus everything that touches `IFileStorage` — upload (streamed, size/quota
 * enforced mid-flight, never buffered whole), download, publish/unpublish, TTL/GC, and project
 * deletion cleanup. Limits are always resolved through the **project owner**
 * (`UserLimitsService.getLimits(project.ownerId)`), never the calling user — a project shared in
 * spirit (not literally, today) would otherwise let anyone touching it burn a different user's quota.
 */
@Injectable()
export class FilesService {
  private readonly files: Repository<File>;
  private readonly projects: Repository<Project>;
  private readonly storage: IFileStorage;
  private readonly userLimits: UserLimitsService;
  private readonly backendPublicUrl: string;

  constructor(
    @InjectRepository(File) files: Repository<File>,
    @InjectRepository(Project) projects: Repository<Project>,
    @Inject(FILE_STORAGE) storage: IFileStorage,
    @Inject(UserLimitsService) userLimits: UserLimitsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.files = files;
    this.projects = projects;
    this.storage = storage;
    this.userLimits = userLimits;
    // No default anywhere else in this codebase (`oauth2.controller.ts` throws instead) — a default
    // is worth it here specifically because dev compose never sets `BACKEND_PUBLIC_URL` at all (only
    // the e2e stack and the k8s ConfigMap do) and a missing base URL would otherwise make every
    // `files-publish` call fail in plain local dev.
    this.backendPublicUrl = config.get<string>('BACKEND_PUBLIC_URL', 'http://localhost:4000');
  }

  /**
   * Streams `source` straight into storage — never buffered whole. `bytesSoFar` is checked against
   * both the per-file cap and the project's remaining quota (`usedBytes`, read once up front — a
   * concurrent upload racing this one could still slip slightly over, an accepted MVP gap) on every
   * chunk, so an oversized upload is aborted mid-flight rather than after it's already landed in S3.
   */
  async upload(projectId: string, source: Readable, meta: IUploadFileMeta): Promise<IApiFile> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException(`Project "${projectId}" not found`);

    const limits = await this.userLimits.getLimits(project.ownerId);
    const usedBytes = await this.getUsedBytes(projectId);
    const mime = meta.mime || 'application/octet-stream';

    const fileId = generateFileId();
    const storageKey = `${projectId}/${fileId}`;

    let bytesSoFar = 0;
    const guard = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        bytesSoFar += chunk.length;
        if (bytesSoFar > limits.maxFileBytes) {
          callback(new FileTooLargeError(`"${meta.name}" is over the ${limits.maxFileBytes}-byte per-file limit`));
          return;
        }
        if (usedBytes + bytesSoFar > limits.maxProjectFilesBytes) {
          callback(new FileTooLargeError(`Project is over its ${limits.maxProjectFilesBytes}-byte file quota`));
          return;
        }
        callback(null, chunk);
      },
    });
    // `.pipe()` doesn't forward a source's own `'error'` to the piped destination — forwarding it
    // manually is what lets `guard`'s destroy reach `Upload.done()` (via `S3FileStorage`) instead of
    // hanging forever waiting for bytes a broken source will never send.
    source.on('error', (error: Error) => guard.destroy(error));
    source.pipe(guard);

    const putResult = await this.storage
      .putStream(storageKey, guard, { contentType: mime })
      .catch((error: unknown) => {
        if (error instanceof FileTooLargeError) throw new PayloadTooLargeException(error.message);
        throw error;
      });

    const now = new Date();
    const expiresAt = resolveExpiresAt(
      now,
      { ttlSeconds: meta.ttlSeconds, createdBy: meta.createdBy, workflowEnv: meta.workflowEnv },
      limits,
    );

    const row = this.files.create({
      id: fileId,
      projectId,
      name: meta.name,
      size: putResult.size,
      mime,
      storageKey,
      createdBy: meta.createdBy,
      expiresAt,
      publicToken: null,
    });
    await this.files.save(row);
    return this.toApiFile(row);
  }

  async get(projectId: string, fileId: string): Promise<IApiFile> {
    return this.toApiFile(await this.getRow(projectId, fileId));
  }

  async getMeta(projectId: string, fileId: string): Promise<IFileRef> {
    return this.toFileRef(await this.getRow(projectId, fileId));
  }

  async openStream(projectId: string, fileId: string): Promise<IOpenedFileStream> {
    const file = await this.getRow(projectId, fileId);
    const result = await this.storage.getStream(file.storageKey);
    return { file, body: result.body, ...(typeof result.contentLength === 'number' ? { contentLength: result.contentLength } : {}) };
  }

  async remove(projectId: string, fileId: string): Promise<void> {
    const row = await this.getRow(projectId, fileId);
    await this.storage.delete(row.storageKey);
    await this.files.remove(row);
  }

  /** Idempotent — re-publishing an already-published file returns the same token/`publicUrl`. */
  async publish(projectId: string, fileId: string): Promise<IApiFile> {
    const row = await this.getRow(projectId, fileId);
    if (!row.publicToken) {
      row.publicToken = generatePublicToken();
      await this.files.save(row);
    }
    return this.toApiFile(row);
  }

  async unpublish(projectId: string, fileId: string): Promise<IApiFile> {
    const row = await this.getRow(projectId, fileId);
    if (row.publicToken) {
      row.publicToken = null;
      await this.files.save(row);
    }
    return this.toApiFile(row);
  }

  async list(projectId: string): Promise<IProjectFilesListResponse> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException(`Project "${projectId}" not found`);
    const limits = await this.userLimits.getLimits(project.ownerId);
    const rows = await this.files.find({ where: { projectId }, order: { createdAt: 'DESC' } });
    const usedBytes = rows.reduce((total, row) => total + row.size, 0);
    return {
      files: rows.map((row) => this.toApiFile(row)),
      usage: { usedBytes, maxProjectFilesBytes: limits.maxProjectFilesBytes, maxFileBytes: limits.maxFileBytes },
    };
  }

  /** `null` for an unknown token, a revoked (`files-unpublish`ed) one, or one whose file has since expired — the public route turns any of these into a plain 404. */
  async getPublic(publicToken: string): Promise<IOpenedFileStream | null> {
    const row = await this.files.findOneBy({ publicToken });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    const result = await this.storage.getStream(row.storageKey);
    return { file: row, body: result.body, ...(typeof result.contentLength === 'number' ? { contentLength: result.contentLength } : {}) };
  }

  /** Deletes every row whose `expiresAt` has passed — S3 objects first, then rows, same order `FileGcService` expects. Returns how many were removed, for logging. */
  async removeExpired(now: Date): Promise<number> {
    const rows = await this.files.find({ where: { expiresAt: LessThanOrEqual(now) } });
    if (rows.length === 0) return 0;
    await this.storage.deleteMany(rows.map((row) => row.storageKey));
    await this.files.remove(rows);
    return rows.length;
  }

  /** Called on project deletion, before the project row itself goes away — `files.project_id`'s FK cascade would clean up the rows regardless, but never the S3 objects, so this must run first (or at least before the S3 objects become unreachable). */
  async removeProjectFiles(projectId: string): Promise<void> {
    const rows = await this.files.find({ where: { projectId } });
    if (rows.length === 0) return;
    await this.storage.deleteMany(rows.map((row) => row.storageKey));
    await this.files.remove(rows);
  }

  private async getRow(projectId: string, fileId: string): Promise<File> {
    const row = await this.files.findOneBy({ id: fileId, projectId });
    if (!row) throw new NotFoundException(`File "${fileId}" not found`);
    return row;
  }

  private async getUsedBytes(projectId: string): Promise<number> {
    const result = await this.files
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.size), 0)', 'total')
      .where('file.projectId = :projectId', { projectId })
      .getRawOne<{ total: string | number }>();
    return Number(result?.total ?? 0);
  }

  private toFileRef(row: File): IFileRef {
    return {
      id: row.id,
      name: row.name,
      size: row.size,
      mime: row.mime,
      ...(row.publicToken ? { publicUrl: this.publicUrlFor(row.publicToken) } : {}),
    };
  }

  private toApiFile(row: File): IApiFile {
    return {
      id: row.id,
      name: row.name,
      size: row.size,
      mime: row.mime,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      publicUrl: row.publicToken ? this.publicUrlFor(row.publicToken) : null,
    };
  }

  private publicUrlFor(publicToken: string): string {
    return `${this.backendPublicUrl}/files/p/${publicToken}`;
  }
}
