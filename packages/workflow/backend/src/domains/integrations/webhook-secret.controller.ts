import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import { deriveIntegrationSecret, resolveWebhookSecretKey } from '@falang/workflow-gateway';
import {
  isWebhookSignatureRequired,
  parseWebhookSignatureVersion,
  WEBHOOK_SECRET_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_VERSION_FIELD,
  WEBHOOK_VENDOR,
  webhookSecretLabel,
} from '@falang/workflow-integrations-webhook';
import type { Repository } from 'typeorm';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsService } from '../projects/projects/projects.service.js';

export interface IWebhookSecretResponse {
  /** The secret a caller proves it knows (shared-secret header value, and the HMAC key of the signature). */
  readonly secret: string;
  /** Header names (HTTP header names are case-insensitive). */
  readonly header: string;
  readonly signatureHeader: string;
  /** The trigger's current `signature_version`. */
  readonly version: number;
  /** Whether the trigger currently requires signed calls. */
  readonly required: boolean;
}

/**
 * Shows an editor the secret of a generic webhook trigger (the `webhook` vendor's `require_signature`). The secret is
 * never stored: it is derived on the server exactly as `ctx.deriveSecret` does at runtime (`deriveIntegrationSecret`, same
 * key, same label), so what the editor shows is what the route accepts. Needs edit access to the project — a read-only
 * admin view never sees it.
 */
@Controller('projects/:projectId/integrations')
export class WebhookSecretController {
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

  @Get('webhook-secret')
  async getWebhookSecret(
    @Param('projectId') projectId: string,
    @Query('documentId') documentId: string | undefined,
    @Query('env') env: string | undefined,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<IWebhookSecretResponse> {
    await this.projectsService.getOwnedProject(projectId, user.id);
    if (env !== 'dev' && env !== 'prod') throw new BadRequestException('env must be "dev" or "prod"');
    if (!documentId) throw new BadRequestException('documentId is required');

    const document = await this.documents.findOneBy({ id: documentId, projectId, type: TRIGGER_FUNCTION_NAME });
    const body = document?.root?.children?.[1];
    const data = body?.name === TRIGGER_FUNCTION_BODY_NAME ? (body.data as Record<string, unknown> | undefined) : null;
    if (!data || data.vendor !== WEBHOOK_VENDOR || typeof data.credentialId !== 'string') {
      throw new NotFoundException('No webhook trigger document with this id');
    }
    const key = resolveWebhookSecretKey(this.config);
    if (!key) throw new ServiceUnavailableException('No webhook secret key configured on this server');

    const triggerConfig = data.triggerConfig as Record<string, string> | undefined;
    const version = parseWebhookSignatureVersion(triggerConfig?.[WEBHOOK_SIGNATURE_VERSION_FIELD]);
    return {
      secret: deriveIntegrationSecret({
        key,
        projectId,
        credentialId: data.credentialId,
        env,
        vendor: WEBHOOK_VENDOR,
        label: webhookSecretLabel(documentId, version),
      }),
      header: WEBHOOK_SECRET_HEADER,
      signatureHeader: WEBHOOK_SIGNATURE_HEADER,
      version,
      required: isWebhookSignatureRequired(triggerConfig),
    };
  }
}
