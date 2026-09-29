import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import type { IApiFile, IProjectFilesListResponse } from './file.types.js';
import { FilesService } from './files.service.js';
import { streamFileResponse } from './stream-file-response.js';
import { contentTypeOf, parseTtlSeconds, rawUploadBody, requireFileName } from './upload-request.js';

type TRawBodyRequest = Request & { rawBody?: Buffer };

/**
 * The project workspace's "Files" tab — JWT-guarded (the app-wide `JwtAuthGuard`), ownership
 * checked the same way every other `projects/:projectId/…` route does
 * (`projectsService.getOwnedProject`). See ADR 0038 (private) §7 and
 * the fixed phase-2 contract's "Проектный API" section.
 */
@Controller('projects/:projectId/files')
export class ProjectFilesController {
  private readonly files: FilesService;
  private readonly projectsService: ProjectsService;

  constructor(
    @Inject(FilesService) files: FilesService,
    @Inject(ProjectsService) projectsService: ProjectsService,
  ) {
    this.files = files;
    this.projectsService = projectsService;
  }

  @Get()
  async list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectFilesListResponse> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    return this.files.list(projectId);
  }

  @Post()
  async upload(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Req() req: TRawBodyRequest,
  ): Promise<IApiFile> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    const name = requireFileName(req.headers['x-file-name']);
    const mime = contentTypeOf(req.headers['content-type']);
    const ttlSeconds = parseTtlSeconds(req.headers['x-file-ttl-seconds']);
    return this.files.upload(projectId, rawUploadBody(req), {
      name,
      mime,
      createdBy: `user:${user.id}`,
      ...(typeof ttlSeconds === 'number' ? { ttlSeconds } : {}),
    });
  }

  @Get(':fileId')
  async download(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    const opened = await this.files.openStream(projectId, fileId);
    await streamFileResponse(res, {
      body: opened.body,
      contentType: opened.file.mime,
      name: opened.file.name,
      disposition: 'attachment',
      ...(typeof opened.contentLength === 'number' ? { contentLength: opened.contentLength } : {}),
    });
  }

  @Delete(':fileId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<Record<string, never>> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    await this.files.remove(projectId, fileId);
    return {};
  }

  @Post(':fileId/publish')
  @HttpCode(200)
  async publish(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IApiFile> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    return this.files.publish(projectId, fileId);
  }

  @Delete(':fileId/publish')
  async unpublish(
    @Param('projectId') projectId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IApiFile> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    return this.files.unpublish(projectId, fileId);
  }
}
