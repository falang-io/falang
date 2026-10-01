import { BadGatewayException, Body, Controller, Inject, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { Public } from '../auth/auth/public.decorator.js';
import { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';
import { ProjectTokenGuard } from '../internal-auth/project-token.guard.js';
import { Document } from '../projects/documents/document.entity.js';
import { ActivepiecesCatalogService } from './activepieces-catalog.service.js';
import { resolveFieldValue } from './credentials-codec.js';
import { requireEncryptionKey } from './credentials-crypto.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { OAuth2AccessTokenDto } from './dto/oauth2-access-token.dto.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { OAuth2RefreshDto } from './dto/oauth2-refresh.dto.js';
// oxlint-disable-next-line consistent-type-imports -- Nest's ValidationPipe resolves the DTO class from this parameter's runtime type metadata.
import { ResolveCredentialDto } from './dto/resolve-credential.dto.js';
import { applyOAuth2TokensToInstance } from './oauth2-tokens-codec.js';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';
import { resolveOAuth2AccessToken } from './resolve-oauth2-access-token.js';

/**
 * Called by the spawned `runner` process's compiled activities (e.g. `telegram-send-message`'s
 * `resolveTelegramBotToken`, `call-ai-text`'s `resolveOpenAiField`) — directly, or indirectly via the
 * standalone `activepieces` service forwarding a runner pod's (or `backend`'s own poll loop's) token
 * — to turn a `credentialId`+field name into a real value at execution time. See ADR 0006's "internal
 * resolver" follow-up, `credentials-codec.ts`'s doc comments, and
 * ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth" for
 * why this is guarded by a per-project token (`ProjectTokenGuard`), not the single shared secret it
 * used to be (`InternalApiGuard`, removed once this endpoint migrated). Scoped to `body.projectId`
 * both for the guard and for which `integrations` documents are even scanned — a leaked token or a
 * compromised runner pod only ever reaches its own project's credentials.
 */
@Public()
@UseGuards(ProjectTokenGuard)
@Controller('internal/credentials')
export class InternalCredentialsController {
  private readonly documents: Repository<Document>;
  private readonly config: ConfigService;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;
  private readonly oauthCredentials: OAuthCredentialsService;

  constructor(
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ConfigService) config: ConfigService,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
    @Inject(OAuthCredentialsService) oauthCredentials: OAuthCredentialsService,
  ) {
    this.documents = documents;
    this.config = config;
    this.activepiecesCatalog = activepiecesCatalog;
    this.oauthCredentials = oauthCredentials;
  }

  /**
   * Resolves one declared credential field of an instance. The platform's OAuth2 `client_id`/
   * `client_secret` (`oauth_credentials`, ADR 0030 (private)) are deliberately NOT answered here — a
   * runner pod runs tenant code and must never see them; token refresh happens on the backend via
   * `oauth2-access-token`. A vendor that still declares these fields itself (native bring-your-own-app
   * vendors: amoCRM, Diadoc) resolves them from the instance like any other field.
   */
  @Post('resolve')
  async resolve(@Body() body: ResolveCredentialDto): Promise<{ value: string }> {
    const integrations = [...REGISTERED_INTEGRATIONS, ...(await this.activepiecesCatalog.getDynamicIntegrations())];
    const integration = integrations.find((candidate) => candidate.vendor === body.vendor);
    const field = integration?.credentialFields.find((candidate) => candidate.name === body.field);
    if (!field) {
      throw new NotFoundException(`No "${body.field}" field declared for vendor "${body.vendor}"`);
    }

    const integrationsDocuments = await this.documents.find({
      where: { type: INTEGRATIONS_DOCUMENT_TYPE, projectId: body.projectId },
    });
    for (const document of integrationsDocuments) {
      const data = document.data as IIntegrationsDocumentData | null;
      const instance = data?.instances.find(
        (candidate) => candidate.id === body.credentialId && candidate.vendor === body.vendor,
      );
      if (!instance) continue;

      const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
      const value = resolveFieldValue(instance, field, body.env, encryptionKey);
      if (!value)
        throw new NotFoundException(
          `No "${body.field}" value configured for credential "${body.credentialId}"/${body.env}`,
        );
      return { value };
    }
    throw new NotFoundException(`Credential "${body.credentialId}" not found`);
  }

  /**
   * A valid access token for an OAuth2 instance, refreshed on the backend when due (platform client
   * secret never leaves it) — the replacement for the pod/`activepieces` resolving `client_secret`.
   */
  @Post('oauth2-access-token')
  async oauth2AccessToken(
    @Body() body: OAuth2AccessTokenDto,
  ): Promise<{ accessToken: string; data: Record<string, unknown> }> {
    const integrations = [...REGISTERED_INTEGRATIONS, ...(await this.activepiecesCatalog.getDynamicIntegrations())];
    const integration = integrations.find((candidate) => candidate.vendor === body.vendor);
    if (!integration?.oauth2) throw new NotFoundException(`Vendor "${body.vendor}" has no OAuth2 config`);
    const documents = await this.documents.find({
      where: { type: INTEGRATIONS_DOCUMENT_TYPE, projectId: body.projectId },
    });
    const match = documents.find((document) =>
      (document.data as IIntegrationsDocumentData | null)?.instances.some(
        (candidate) => candidate.id === body.credentialId && candidate.vendor === body.vendor,
      ),
    );
    const data = match?.data as IIntegrationsDocumentData | null | undefined;
    const instance = data?.instances.find((candidate) => candidate.id === body.credentialId);
    if (!match || !data || !instance) throw new NotFoundException(`Credential "${body.credentialId}" not found`);

    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    const result = await resolveOAuth2AccessToken(this.oauthCredentials, integration, instance, encryptionKey).catch(
      (error: unknown) => {
        throw new BadGatewayException(error instanceof Error ? error.message : 'OAuth2 token resolution failed');
      },
    );
    if (result.refreshed) {
      match.data = applyOAuth2TokensToInstance(data, body.credentialId, result.refreshed, encryptionKey);
      await this.documents.save(match);
    }
    return { accessToken: result.accessToken, data: result.data };
  }

  /** Called by `activepieces/`'s `auth-resolver.ts` after a best-effort reactive token refresh — see ADR 0015 (private). */
  @Post('oauth2-refresh')
  async oauth2Refresh(@Body() body: OAuth2RefreshDto): Promise<{ status: 'ok' }> {
    const integrationsDocuments = await this.documents.find({
      where: { type: INTEGRATIONS_DOCUMENT_TYPE, projectId: body.projectId },
    });
    const match = integrationsDocuments.find((document) => {
      const data = document.data as IIntegrationsDocumentData | null;
      return data?.instances.some(
        (candidate) => candidate.id === body.credentialId && candidate.vendor === body.vendor,
      );
    });
    if (!match) throw new NotFoundException(`Credential "${body.credentialId}" not found`);

    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    match.data = applyOAuth2TokensToInstance(
      match.data as IIntegrationsDocumentData,
      body.credentialId,
      {
        accessToken: body.accessToken,
        ...(body.refreshToken ? { refreshToken: body.refreshToken } : {}),
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
        ...(body.data ? { oauthData: JSON.stringify(body.data) } : {}),
      },
      encryptionKey,
    );
    await this.documents.save(match);
    return { status: 'ok' };
  }
}
