import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth/public.decorator.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
import { toFileRef } from './file-ref-mapper.js';
import type { IFileRef } from './file.types.js';
import { FilesService } from './files.service.js';
import { streamFileResponse } from './stream-file-response.js';
import {
  contentTypeOf,
  parseCreatedBy,
  parseTtlSeconds,
  parseWorkflowEnv,
  rawUploadBody,
  requireFileName,
} from './upload-request.js';

type TRawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Called by a runner pod's compiled activities (`@falang/workflow-integrations-files`'s
 * `uploadFileFromStream`/`openFileStream`/`deleteFile`/`publishFile`/… helpers) and, in-process, by
 * anything else on `backend` that needs to hand a project a file (Telegram media ingress, per
 * ADR 0038 (private) §5) — see that ADR's §2/§4 and the fixed phase-2
 * contract for the exact wire shapes. Guarded by `ProjectTokenGuard` exactly like
 * `internal-credentials`/`internal-artifacts`: a leaked token only ever reaches its own project's
 * files, never another tenant's.
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/files')
export class InternalFilesController {
  private readonly files: FilesService;

  constructor(@Inject(FilesService) files: FilesService) {
    this.files = files;
  }

  @Post(':projectId')
  async upload(@Param('projectId') projectId: string, @Req() req: TRawBodyRequest): Promise<IFileRef> {
    const name = requireFileName(req.headers['x-file-name']);
    const mime = contentTypeOf(req.headers['content-type']);
    const ttlSeconds = parseTtlSeconds(req.headers['x-file-ttl-seconds']);
    const createdBy = parseCreatedBy(req.headers['x-created-by'], 'run:unknown');
    const workflowEnv = parseWorkflowEnv(req.headers['x-workflow-env']);
    const apiFile = await this.files.upload(projectId, rawUploadBody(req), {
      name,
      mime,
      createdBy,
      ...(typeof ttlSeconds === 'number' ? { ttlSeconds } : {}),
      ...(typeof workflowEnv === 'string' ? { workflowEnv } : {}),
    });
    return toFileRef(apiFile);
  }

  @Get(':projectId/:fileId')
  async download(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const opened = await this.files.openStream(projectId, fileId);
    await streamFileResponse(res, {
      body: opened.body,
      contentType: opened.file.mime,
      name: opened.file.name,
      disposition: 'inline',
      ...(typeof opened.contentLength === 'number' ? { contentLength: opened.contentLength } : {}),
    });
  }

  @Get(':projectId/:fileId/meta')
  getMeta(@Param('projectId') projectId: string, @Param('fileId') fileId: string): Promise<IFileRef> {
    return this.files.getMeta(projectId, fileId);
  }

  @Delete(':projectId/:fileId')
  async remove(@Param('projectId') projectId: string, @Param('fileId') fileId: string): Promise<Record<string, never>> {
    await this.files.remove(projectId, fileId);
    return {};
  }

  @Post(':projectId/:fileId/publish')
  @HttpCode(200)
  async publish(@Param('projectId') projectId: string, @Param('fileId') fileId: string): Promise<IFileRef> {
    return toFileRef(await this.files.publish(projectId, fileId));
  }

  @Delete(':projectId/:fileId/publish')
  async unpublish(@Param('projectId') projectId: string, @Param('fileId') fileId: string): Promise<IFileRef> {
    return toFileRef(await this.files.unpublish(projectId, fileId));
  }
}
