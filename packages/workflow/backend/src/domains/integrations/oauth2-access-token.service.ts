import { BadGatewayException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { IOAuth2AccessTokenPort } from '@falang/workflow-gateway';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';
import { Document } from '../projects/documents/document.entity.js';
import { ActivepiecesCatalogService } from './activepieces-catalog.service.js';
import { requireEncryptionKey } from './credentials-crypto.js';
import { applyOAuth2TokensToInstance } from './oauth2-tokens-codec.js';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';
import { resolveOAuth2AccessToken } from './resolve-oauth2-access-token.js';

/**
 * A valid access token for one project's OAuth2 credential instance, refreshed with the platform (or the instance's
 * own) OAuth2 client when it is about to expire and persisted back into the project's `integrations` document. Used
 * by `POST /internal/credentials/oauth2-access-token` (runner pods, the `activepieces` service) and, as
 * `@falang/workflow-gateway`'s `OAUTH2_ACCESS_TOKEN_PORT`, by a vendor's `registerBackend` (`ctx.getOAuth2AccessToken`).
 */
@Injectable()
export class OAuth2AccessTokenService implements IOAuth2AccessTokenPort {
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

  async resolve(
    projectId: string,
    vendor: string,
    credentialId: string,
  ): Promise<{ accessToken: string; data: Record<string, unknown> }> {
    const integrations = [...REGISTERED_INTEGRATIONS, ...(await this.activepiecesCatalog.getDynamicIntegrations())];
    const integration = integrations.find((candidate) => candidate.vendor === vendor);
    if (!integration?.oauth2) throw new NotFoundException(`Vendor "${vendor}" has no OAuth2 config`);
    const documents = await this.documents.find({ where: { type: INTEGRATIONS_DOCUMENT_TYPE, projectId } });
    const match = documents.find((document) =>
      (document.data as IIntegrationsDocumentData | null)?.instances.some(
        (candidate) => candidate.id === credentialId && candidate.vendor === vendor,
      ),
    );
    const data = match?.data as IIntegrationsDocumentData | null | undefined;
    const instance = data?.instances.find((candidate) => candidate.id === credentialId);
    if (!match || !data || !instance) throw new NotFoundException(`Credential "${credentialId}" not found`);

    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    const result = await resolveOAuth2AccessToken(this.oauthCredentials, integration, instance, encryptionKey).catch(
      (error: unknown) => {
        throw new BadGatewayException(error instanceof Error ? error.message : 'OAuth2 token resolution failed');
      },
    );
    if (result.refreshed) {
      match.data = applyOAuth2TokensToInstance(data, credentialId, result.refreshed, encryptionKey);
      await this.documents.save(match);
    }
    return { accessToken: result.accessToken, data: result.data };
  }

  async getAccessToken(projectId: string, vendor: string, credentialId: string): Promise<string> {
    const { accessToken } = await this.resolve(projectId, vendor, credentialId);
    return accessToken;
  }
}
