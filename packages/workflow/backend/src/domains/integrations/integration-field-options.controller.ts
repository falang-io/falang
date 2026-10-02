import { BadRequestException, Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithEgressVendor } from '@falang/workflow-egress';
import { InjectRepository } from '@nestjs/typeorm';
import {
  getChoiceHeaderFields,
  INTEGRATIONS_DOCUMENT_TYPE,
  type IFieldSelectOption,
  type IIntegrationsDocumentData,
} from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { resolveFieldValue } from './credentials-codec.js';
import { requireEncryptionKey } from './credentials-crypto.js';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';
import { IntegrationVendorDataService } from './vendor-data/integration-vendor-data.service.js';

/**
 * Called directly by the logged-in editor (JWT-authenticated, project-ownership-scoped) to populate
 * any `kind: 'select'` field's live options (e.g. `call-ai-text`'s `model`) via its `loadOptions` —
 * distinct from `InternalCredentialsController`, which is guarded by the internal shared secret for
 * the spawned `runner` process instead. Always resolves the `dev` value of every credential field:
 * loading options is inherently an edit-time action, never something the published (`prod`) runtime
 * does. Zero vendor-specific code — this walks `REGISTERED_INTEGRATIONS` generically by name.
 */
@Controller('projects/:projectId/integrations')
export class IntegrationFieldOptionsController {
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

  @Get(':credentialId/actions/:actionName/fields/:fieldName/options')
  async loadFieldOptions(
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @Param('actionName') actionName: string,
    @Param('fieldName') fieldName: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IFieldSelectOption[]> {
    await this.projectsService.getOwnedProject(projectId, user.id);

    const integrationsDocument = await this.documents.findOneBy({ projectId, type: INTEGRATIONS_DOCUMENT_TYPE });
    const data = integrationsDocument?.data as IIntegrationsDocumentData | null | undefined;
    const instance = data?.instances.find((candidate) => candidate.id === credentialId);
    if (!instance) throw new NotFoundException(`Credential "${credentialId}" not found`);

    const integration = REGISTERED_INTEGRATIONS.find((candidate) => candidate.vendor === instance.vendor);
    // `actionName` may name either an `IActionDescriptor` (`fields`) or an `IChoiceDescriptor`
    // (`contextFields`/`promptFields`, e.g. `call-ai-choice`'s `model`) — check both, same as
    // the editor stores that call this endpoint (`IntegrationActionEditorStore`/`ChoiceEditorStore`).
    const action = integration?.actions.find((candidate) => candidate.name === actionName);
    const choice = integration?.choices?.find((candidate) => candidate.name === actionName);
    const fields = action ? action.fields : choice && getChoiceHeaderFields(choice);
    const field = fields && fields.find((candidate) => candidate.name === fieldName);
    if (!integration || !field?.loadOptions) {
      throw new BadRequestException(`"${actionName}.${fieldName}" doesn't support loading options`);
    }

    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    const resolvedFields: Record<string, string> = {};
    for (const credentialField of integration.credentialFields) {
      resolvedFields[credentialField.name] = resolveFieldValue(instance, credentialField, 'dev', encryptionKey) ?? '';
    }
    // `ctx.vendorData` backs `sql-common`'s `table` field (ADR 0039 (private) §6's `loadOptions`
    // extension) — options come from a previously-synced schema rather than a fresh live round trip.
    const vendorData = await this.vendorData.getAll(projectId, credentialId);
    const loadOptions = field.loadOptions.bind(field);
    return [
      ...(await runWithEgressVendor(instance.vendor, () => loadOptions(resolvedFields, { instance, vendorData }))),
    ];
  }
}
