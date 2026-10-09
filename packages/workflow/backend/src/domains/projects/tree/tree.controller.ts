import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { IProjectTreeFolder } from '@falang/dto';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { DocumentsService, type IProjectTreeDocumentWithLock } from '../documents/documents.service.js';
import { FoldersService } from '../folders/folders.service.js';

export interface IProjectTreeResponse {
  folders: IProjectTreeFolder[];
  documents: IProjectTreeDocumentWithLock[];
}

/**
 * Lightweight structure-only listing (no `root`/`data` payloads) — the client loads this first,
 * then bulk-loads every document's full payload via `DocumentsController.list`.
 */
@Controller('projects/:projectId/tree')
export class TreeController {
  private readonly foldersService: FoldersService;
  private readonly documentsService: DocumentsService;

  constructor(
    @Inject(FoldersService) foldersService: FoldersService,
    @Inject(DocumentsService) documentsService: DocumentsService,
  ) {
    this.foldersService = foldersService;
    this.documentsService = documentsService;
  }

  @Get()
  async get(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IProjectTreeResponse> {
    const [folders, documents] = await Promise.all([
      this.foldersService.listTree(projectId, user.id, 'read'),
      this.documentsService.listTree(projectId, user.id, 'read'),
    ]);
    return { folders, documents };
  }
}
