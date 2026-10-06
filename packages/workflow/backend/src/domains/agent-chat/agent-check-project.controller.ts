import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { ActivepiecesCatalogService } from '../integrations/activepieces-catalog.service.js';
import { getIntegrationsForCompile } from '../build/build/compile-project-documents.js';
import { DocumentsService } from '../projects/documents/documents.service.js';
import { checkProjectForAgent, type IAgentCheckDiagnostic } from './agent-check-project.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe needs the DTO class at runtime.
import { AgentCheckProjectDto } from './dto/agent-check-project.dto.js';

/** `POST /projects/:projectId/agent/check-project` — the in-app agent's `check_project` tool; see `checkProjectForAgent`. ADR 0062 (private). */
@Controller('projects/:projectId/agent/check-project')
export class AgentCheckProjectController {
  private readonly documentsService: DocumentsService;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;

  constructor(
    @Inject(DocumentsService) documentsService: DocumentsService,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
  ) {
    this.documentsService = documentsService;
    this.activepiecesCatalog = activepiecesCatalog;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async check(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
    @Body() dto: AgentCheckProjectDto,
  ): Promise<{ diagnostics: IAgentCheckDiagnostic[] }> {
    // `listFull` is the owner check (404/403 for a foreign project) and loads the stored trees.
    const documents = await this.documentsService.listFull(projectId, user.id);
    const integrations = await getIntegrationsForCompile(this.activepiecesCatalog);
    return { diagnostics: await checkProjectForAgent(documents, dto.documents, integrations) };
  }
}
