import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import type { IProjectDocument } from '@falang/dto';
import { DEFAULT_LOCK_TTL_MS } from '@falang/mcp-core';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
// Kept as value imports (not `import type`): Nest's global `ValidationPipe` resolves the DTO
// class to validate against from these parameters' runtime type metadata, so erasing the import
// would silently disable body validation on these routes.
// oxlint-disable-next-line consistent-type-imports
import { CreateDocumentDto } from './dto/create-document.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { UpdateDocumentDto } from './dto/update-document.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { LockDocumentDto } from './dto/lock-document.dto.js';
// oxlint-disable-next-line consistent-type-imports
import { UnlockDocumentDto } from './dto/unlock-document.dto.js';
import { DocumentsService, type IDocumentLockInfo } from './documents.service.js';

/** Full document payloads (`root`/`data` included) — see `ProjectsController.tree` for the lightweight structure-only listing. */
@Controller('projects/:projectId/documents')
export class DocumentsController {
  private readonly documentsService: DocumentsService;

  constructor(@Inject(DocumentsService) documentsService: DocumentsService) {
    this.documentsService = documentsService;
  }

  @Get()
  list(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IProjectDocument[]> {
    return this.documentsService.listFull(projectId, user.id);
  }

  /**
   * Active document locks for this project — see ADR 0029 (private)'s
   * "Document locks" decision. Registered before `:documentId`-shaped routes below aren't ambiguous
   * with this static path (there is no `@Get(':documentId')` on this controller), but kept first for
   * readability regardless.
   */
  @Get('locks')
  getLocks(@Param('projectId') projectId: string, @CurrentUser() user: IJwtPayloadUser): Promise<IDocumentLockInfo[]> {
    return this.documentsService.getLocks(projectId, user.id);
  }

  /**
   * Lets the in-app editing agent hold a document's lock for as long as it has that document's
   * `Scheme` open (ADR 0034 §2.4), not just for one write call — `owner` is the calling browser
   * tab's own generated id, renewed on every touch (same owner = extend, not conflict).
   */
  @Post(':documentId/lock')
  lock(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Body() body: LockDocumentDto,
  ): Promise<IDocumentLockInfo> {
    return this.documentsService.lockDocument(
      projectId,
      user.id,
      documentId,
      body.owner,
      body.ttlMs ?? DEFAULT_LOCK_TTL_MS,
    );
  }

  @Delete(':documentId/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlock(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Body() body: UnlockDocumentDto,
  ): Promise<void> {
    await this.documentsService.unlockDocument(projectId, user.id, documentId, body.owner);
  }

  @Post()
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Body() body: CreateDocumentDto,
  ): Promise<IProjectDocument> {
    return this.documentsService.create(projectId, user.id, body);
  }

  @Patch(':documentId')
  update(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Body() body: UpdateDocumentDto,
  ): Promise<IProjectDocument> {
    return this.documentsService.update(projectId, user.id, documentId, body, body.lockOwner);
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<void> {
    await this.documentsService.delete(projectId, user.id, documentId);
  }
}
