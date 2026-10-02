import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithEgressVendor } from '@falang/workflow-egress';
import { InjectRepository } from '@nestjs/typeorm';
import {
  buildOAuth2TokenRequest,
  INTEGRATIONS_DOCUMENT_TYPE,
  type IIntegrationsDocumentData,
} from '@falang/workflow-integrations-common';
import type { Response } from 'express';
import type { Repository } from 'typeorm';
import { CurrentUser } from '../auth/auth/current-user.decorator.js';
import { Public } from '../auth/auth/public.decorator.js';
import type { IJwtPayloadUser } from '../auth/auth/jwt.strategy.js';
import { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { ActivepiecesCatalogService } from './activepieces-catalog.service.js';
import { requireEncryptionKey } from './credentials-crypto.js';
import { renderOAuth2CallbackPage } from './oauth2-callback-page.js';
import { normalizeOAuth2AccountDomain } from './oauth2-account-domain.js';
import { buildPkcePair, type IPkcePair } from './oauth2-pkce.js';
import { OAuth2PendingStateService, type IPendingOAuth2State } from './oauth2-pending-state.service.js';
import { applyOAuth2TokensToInstance } from './oauth2-tokens-codec.js';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';
import { resolveOAuth2ClientCredentials } from './resolve-oauth2-client-credentials.js';

interface ITokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly [key: string]: unknown;
}

/**
 * The OAuth2 authorization-code flow's two routes — see ADR 0015 (private).
 * `/oauth2/start` is normal-JWT-authed (called from the editor); the callback is `@Public()` since a
 * real top-level browser redirect from the vendor can't carry our `Authorization` header — it
 * self-authenticates via a single-use, server-side `state` instead (`OAuth2PendingStateService`).
 */
@Controller()
export class OAuth2Controller {
  private readonly documents: Repository<Document>;
  private readonly config: ConfigService;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;
  private readonly projectsService: ProjectsService;
  private readonly pendingStates: OAuth2PendingStateService;
  private readonly oauthCredentials: OAuthCredentialsService;

  constructor(
    @InjectRepository(Document) documents: Repository<Document>,
    @Inject(ConfigService) config: ConfigService,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(OAuth2PendingStateService) pendingStates: OAuth2PendingStateService,
    @Inject(OAuthCredentialsService) oauthCredentials: OAuthCredentialsService,
  ) {
    this.documents = documents;
    this.config = config;
    this.activepiecesCatalog = activepiecesCatalog;
    this.projectsService = projectsService;
    this.pendingStates = pendingStates;
    this.oauthCredentials = oauthCredentials;
  }

  @Post('projects/:projectId/integrations/:credentialId/oauth2/start')
  async start(
    @Param('projectId') projectId: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: IJwtPayloadUser,
  ): Promise<{ authorizeUrl: string }> {
    await this.projectsService.getOwnedProject(projectId, user.id);

    const document = await this.documents.findOneBy({ projectId, type: INTEGRATIONS_DOCUMENT_TYPE });
    const data = document?.data as IIntegrationsDocumentData | null | undefined;
    const instance = data?.instances.find((candidate) => candidate.id === credentialId);
    if (!instance) throw new NotFoundException(`Credential "${credentialId}" not found`);

    const integrations = [...REGISTERED_INTEGRATIONS, ...(await this.activepiecesCatalog.getDynamicIntegrations())];
    const integration = integrations.find((candidate) => candidate.vendor === instance.vendor);
    if (!integration?.oauth2) throw new BadRequestException(`Vendor "${instance.vendor}" has no OAuth2 config`);

    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    const clientCredentials = await resolveOAuth2ClientCredentials(
      this.oauthCredentials,
      integration,
      instance,
      'dev',
      encryptionKey,
    );
    if (!clientCredentials) {
      throw new BadRequestException('Fill in and save "Client ID"/"Client secret" before connecting');
    }
    const { clientId } = clientCredentials;

    const backendUrl = this.config.get<string>('BACKEND_PUBLIC_URL');
    if (!backendUrl) throw new Error('BACKEND_PUBLIC_URL is not configured');

    const state = randomBytes(32).toString('base64url');
    const pkce: IPkcePair | null = integration.oauth2.pkce
      ? buildPkcePair(integration.oauth2.pkceMethod ?? 'S256')
      : null;
    this.pendingStates.set(state, {
      projectId,
      credentialId,
      vendor: instance.vendor,
      ...(pkce ? { codeVerifier: pkce.verifier } : {}),
    });

    const redirectUri = `${backendUrl}/oauth2/callback/${instance.vendor}`;
    const url = new URL(integration.oauth2.authUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', integration.oauth2.scope.join(' '));
    url.searchParams.set('state', state);
    // Vendor-declared extras go on after the standard params so they can override them; an empty
    // value suppresses a param entirely (see `IOAuth2Config.extra`). `prompt` is applied last so a
    // vendor's explicit setting always wins over an `extra`-supplied default — `'omit'` means "send
    // no prompt param at all", not the literal string.
    for (const [key, value] of Object.entries(integration.oauth2.extra ?? {})) {
      if (value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (integration.oauth2.prompt === 'omit') url.searchParams.delete('prompt');
    else if (integration.oauth2.prompt) url.searchParams.set('prompt', integration.oauth2.prompt);
    if (pkce) {
      url.searchParams.set('code_challenge', pkce.challenge);
      url.searchParams.set('code_challenge_method', integration.oauth2.pkceMethod ?? 'S256');
    }
    return { authorizeUrl: url.toString() };
  }

  @Public()
  @Get('oauth2/callback/:vendor')
  async callback(
    @Param('vendor') vendor: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    // Vendor-specific extra params (e.g. amoCRM's `referer`, see `IOAuth2Config.accountDomainCallbackParam`)
    // ride along on the same redirect — captured generically here rather than one `@Query(name)` per vendor.
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    if (oauthError || !state) {
      res
        .type('html')
        .send(renderOAuth2CallbackPage({ status: 'error', credentialId: '', message: oauthError ?? 'missing state' }));
      return;
    }
    const pending = this.pendingStates.consume(state);
    if (!pending || pending.vendor !== vendor || !code) {
      res.type('html').send(
        renderOAuth2CallbackPage({
          status: 'error',
          credentialId: pending?.credentialId ?? '',
          message: 'invalid or expired connection attempt',
        }),
      );
      return;
    }

    try {
      await this.exchangeAndPersistTokens(vendor, pending, code, query);
      res.type('html').send(renderOAuth2CallbackPage({ status: 'success', credentialId: pending.credentialId }));
    } catch (error) {
      res.type('html').send(
        renderOAuth2CallbackPage({
          status: 'error',
          credentialId: pending.credentialId,
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      );
    }
  }

  private async exchangeAndPersistTokens(
    vendor: string,
    pending: IPendingOAuth2State,
    code: string,
    callbackQuery: Record<string, string>,
  ): Promise<void> {
    const integrations = [...REGISTERED_INTEGRATIONS, ...(await this.activepiecesCatalog.getDynamicIntegrations())];
    const integration = integrations.find((candidate) => candidate.vendor === vendor);
    const document = await this.documents.findOneBy({ projectId: pending.projectId, type: INTEGRATIONS_DOCUMENT_TYPE });
    const data = document?.data as IIntegrationsDocumentData | null | undefined;
    const instance = data?.instances.find((candidate) => candidate.id === pending.credentialId);
    if (!integration?.oauth2 || !document || !data || !instance) {
      throw new Error(`Credential "${pending.credentialId}" no longer exists`);
    }

    const encryptionKey = requireEncryptionKey(this.config.get<string>('CREDENTIALS_ENCRYPTION_KEY'));
    const clientCredentials = await resolveOAuth2ClientCredentials(
      this.oauthCredentials,
      integration,
      instance,
      'dev',
      encryptionKey,
    );
    if (!clientCredentials) throw new Error('Client ID/secret missing');
    const { clientId, clientSecret } = clientCredentials;

    let accountDomain: string | null = null;
    if (integration.oauth2.accountDomainCallbackParam) {
      const raw = callbackQuery[integration.oauth2.accountDomainCallbackParam];
      if (!raw) throw new Error(`Missing "${integration.oauth2.accountDomainCallbackParam}" callback parameter`);
      accountDomain = normalizeOAuth2AccountDomain(raw);
    }

    const backendUrl = this.config.get<string>('BACKEND_PUBLIC_URL');
    const redirectUri = `${backendUrl}/oauth2/callback/${vendor}`;
    const { url, init } = buildOAuth2TokenRequest(
      integration.oauth2,
      clientId,
      clientSecret,
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        ...(pending.codeVerifier ? { code_verifier: pending.codeVerifier } : {}),
      },
      accountDomain,
    );
    const response = await runWithEgressVendor(vendor, () => fetch(url, init));
    if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
    const tokens = (await response.json()) as ITokenResponse;

    document.data = applyOAuth2TokensToInstance(
      data,
      pending.credentialId,
      {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        ...(tokens.expires_in ? { expiresAt: String(Date.now() + tokens.expires_in * 1000) } : {}),
        ...(accountDomain ? { accountDomain } : {}),
      },
      encryptionKey,
    );
    await this.documents.save(document);
  }
}
