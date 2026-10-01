import { BadRequestException, Controller, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { getBackendEgress } from '../../../net/egress-guard.js';
import { CurrentUser } from '../../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../../auth/auth/jwt.strategy.js';
import { Document } from '../../projects/documents/document.entity.js';
import { ProjectsService } from '../../projects/projects/projects.service.js';
import { resolveFieldValue } from '../credentials-codec.js';
import { requireEncryptionKey } from '../credentials-crypto.js';
import { REGISTERED_INTEGRATIONS } from '../registered-integrations.js';
import { IntegrationVendorDataService } from './integration-vendor-data.service.js';

/**
 * "Sync structure" — ADR 0039 (private) §4. Called directly by the logged-in
 * editor (JWT-authenticated, project-ownership-scoped, same pattern as `IntegrationFieldOptionsController`),
 * never by a runner pod: schema-syncing is inherently an edit-time action, so every credential field is
 * always resolved for the **dev** environment regardless of which env the project is currently running
 * in, exactly like `IntegrationFieldOptionsController`'s own `loadOptions` call.
 */
@Controller('projects/:projectId/integrations')
export class SyncVendorDataController {
  private readonly documents: Repository<Document>;
  private readonly projectsService: ProjectsService;
  private readonly config: ConfigService;
  private readonly vendorData: IntegrationVendorDataService;

  constructor(
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(IntegrationVendorDataService) vendorData: IntegrationVendorDataService,
  ) {
    this.documents = documents;
    this.projectsService = projectsService;
    this.config = config;
    this.vendorData = vendorData;
  }

  @Post(':credentialId/sync-schema')
  async syncSchema(
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<Record<string, Record<string, unknown>>> {
    await this.projectsService.getOwnedProject(projectId, user.id);

    const integrationsDocument = await this.documents.findOneBy({ projectId, type: INTEGRATIONS_DOCUMENT_TYPE });
    const data = integrationsDocument?.data as IIntegrationsDocumentData | null | undefined;
    const instance = data?.instances.find((candidate) => candidate.id === credentialId);
    if (!instance) throw new NotFoundException(`Credential "${credentialId}" not found`);

    const integration = REGISTERED_INTEGRATIONS.find((candidate) => candidate.vendor === instance.vendor);
    if (!integration?.syncVendorData) {
      throw new BadRequestException(`Vendor "${instance.vendor}" doesn't support "Sync structure"`);
    }

    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    const resolvedFields: Record<string, string> = {};
    for (const credentialField of integration.credentialFields) {
      resolvedFields[credentialField.name] = resolveFieldValue(instance, credentialField, 'dev', encryptionKey) ?? '';
    }

    const synced = await integration.syncVendorData(resolvedFields, 'dev', { egress: getBackendEgress() });
    for (const [key, value] of Object.entries(synced)) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of keys at most (today just "schema"); each is its own row write.
      await this.vendorData.set(projectId, credentialId, instance.vendor, key, value);
    }

    return this.vendorData.getAll(projectId, credentialId);
  }
}
