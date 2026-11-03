import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { Repository } from 'typeorm';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';
import { buildTriggerAddresses, type ITriggerAddress } from './trigger-addresses.js';

export interface ITriggerAddressesResponse {
  /** The public host webhooks are reached on (`GATEWAY_PUBLIC_HOST`, else `BACKEND_PUBLIC_URL`); `null` when unset. */
  readonly baseUrl: string | null;
  readonly triggers: ITriggerAddress[];
}

/**
 * The inbound URLs a user has to paste into a third-party service — one per trigger of a vendor without automatic
 * subscription (see `buildTriggerAddresses`). Readable by whoever can read the project (incl. an admin's read-only view).
 */
@Controller('projects/:projectId')
export class TriggerAddressesController {
  private readonly documents: Repository<Document>;
  private readonly projectsService: ProjectsService;
  private readonly config: ConfigService;

  constructor(
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.documents = documents;
    this.projectsService = projectsService;
    this.config = config;
  }

  @Get('trigger-addresses')
  async list(
    @Param('projectId') projectId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<ITriggerAddressesResponse> {
    await this.projectsService.getOwnedProject(projectId, user.id, 'read');
    const documents = await this.documents.findBy({ projectId, type: TRIGGER_FUNCTION_NAME });
    const baseUrl =
      this.config.get<string>('GATEWAY_PUBLIC_HOST')?.trim() ||
      this.config.get<string>('BACKEND_PUBLIC_URL')?.trim() ||
      null;
    return {
      baseUrl,
      triggers: buildTriggerAddresses({
        baseUrl,
        projectId,
        documents: documents.map((document) => ({ id: document.id, name: document.name, root: document.root })),
        integrations: REGISTERED_INTEGRATIONS,
      }),
    };
  }
}
