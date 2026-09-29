import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth/public.decorator.js';
import { FilesService } from './files.service.js';
import { inlineDispositionFor, streamFileResponse } from './stream-file-response.js';

/**
 * The capability-URL behind `File.publicUrl` (`files-publish`) — see
 * ADR 0038 (private) §1/§2 ("public access is opt-in per file"). The
 * only unauthenticated, data-serving route in this app: no `ProjectTokenGuard`/JWT, just an
 * unguessable `public_token` — an unknown, cleared (`files-unpublish`ed), or expired token all get
 * the same plain 404, never a hint about which. `Cache-Control: private` (not `public`) since the
 * URL itself is the only credential — an intermediate cache holding onto it would defeat
 * `files-unpublish`.
 *
 * No `@UseGuards` at all — unlike every other `@Public()` route in this app, which still sits behind
 * `ProjectTokenGuard`/`AdminGuard`/etc. `JwtAuthGuard` is the only guard in play here (global,
 * `APP_GUARD`) and `@Public()` exempts this route from it.
 */
@Public()
@Controller('files')
export class PublicFilesController {
  private readonly files: FilesService;

  constructor(@Inject(FilesService) files: FilesService) {
    this.files = files;
  }

  @Get('p/:publicToken')
  async download(@Param('publicToken') publicToken: string, @Res({ passthrough: false }) res: Response): Promise<void> {
    const opened = await this.files.getPublic(publicToken);
    if (!opened) throw new NotFoundException('File not found');
    await streamFileResponse(res, {
      body: opened.body,
      contentType: opened.file.mime,
      name: opened.file.name,
      disposition: inlineDispositionFor(opened.file.mime),
      cacheControl: 'private',
      ...(typeof opened.contentLength === 'number' ? { contentLength: opened.contentLength } : {}),
    });
  }
}
