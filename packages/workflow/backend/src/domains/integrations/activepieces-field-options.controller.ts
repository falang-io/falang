import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { activepiecesVendorFor } from '@falang/workflow-integrations-activepieces';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type IFieldSelectOption,
  type IIntegrationsDocumentData,
} from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsService } from '../projects/projects/projects.service.js';

interface IActivepiecesRawOption {
  readonly label: string;
  readonly value: unknown;
}

/**
 * Proxies a `DROPDOWN`/`MULTI_SELECT_DROPDOWN` ActivePieces prop's live options to the standalone
 * `falang-workflow-activepieces` service — the ActivePieces analog of
 * `IntegrationFieldOptionsController`, which cannot serve this: `activepieces-action` never routes
 * through `IActionDescriptor`/`IFieldConfig.loadOptions` (see `piece-to-credential-integration.ts`),
 * and options resolution must go over HTTP to that service (see `activepieces/src/routes/options.ts`),
 * not an in-process closure. Project-ownership-scoped like the generic controller, since this route
 * takes a raw `credentialId` and must not let an authenticated user probe credentials cross-project.
 */
@Controller('projects/:projectId/activepieces')
export class ActivepiecesFieldOptionsController {
  private readonly documents: Repository<Document>;
  private readonly projectsService: ProjectsService;
  private readonly config: ConfigService;
  private readonly projectTokens: ProjectTokenService;

  constructor(
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(ProjectTokenService) projectTokens: ProjectTokenService,
  ) {
    this.documents = documents;
    this.projectsService = projectsService;
    this.config = config;
    this.projectTokens = projectTokens;
  }

  @Get('credentials/:credentialId/pieces/:pieceName/actions/:actionName/fields/:fieldName/options')
  async loadFieldOptions(
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @Param('pieceName') pieceName: string,
    @Param('actionName') actionName: string,
    @Param('fieldName') fieldName: string,
    @Query('propsValue') propsValue: string | undefined,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IFieldSelectOption[]> {
    await this.projectsService.getOwnedProject(projectId, user.id);

    const integrationsDocument = await this.documents.findOneBy({ projectId, type: INTEGRATIONS_DOCUMENT_TYPE });
    const data = integrationsDocument?.data as IIntegrationsDocumentData | null | undefined;
    const instance = data?.instances.find((candidate) => candidate.id === credentialId);
    if (!instance) throw new NotFoundException(`Credential "${credentialId}" not found`);
    if (instance.vendor !== activepiecesVendorFor(pieceName)) {
      throw new NotFoundException(`Credential "${credentialId}" isn't for piece "${pieceName}"`);
    }

    const baseUrl = this.config.get<string>('ACTIVEPIECES_SERVICE_URL');
    const secret = this.config.get<string>('ACTIVEPIECES_SERVICE_SECRET');
    if (!baseUrl || !secret) return [];

    // `internalProjectToken` is what the service ultimately presents back to this same `backend`'s
    // `/internal/credentials/resolve` (via `resolveAuthValue`) — see
    // ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth".
    const internalProjectToken = this.projectTokens.getOrCreateToken(projectId);
    const query = `?propsValue=${encodeURIComponent(propsValue ?? '{}')}&projectId=${encodeURIComponent(projectId)}&internalProjectToken=${encodeURIComponent(internalProjectToken)}`;
    const url = `${baseUrl}/credentials/${credentialId}/pieces/${pieceName}/actions/${actionName}/fields/${fieldName}/options${query}`;
    const response = await this.fetchOptions(url, secret);
    if (!response) return [];
    if (!response.ok) throw new BadRequestException(`"${actionName}.${fieldName}" doesn't support loading options`);

    const body = (await response.json()) as { options: readonly IActivepiecesRawOption[] };
    return body.options.map((option) => ({ value: JSON.stringify(option.value), label: option.label }));
  }

  private async fetchOptions(url: string, secret: string): Promise<Response | null> {
    try {
      return await fetch(url, { headers: { 'x-internal-api-key': secret } });
    } catch {
      return null;
    }
  }
}
