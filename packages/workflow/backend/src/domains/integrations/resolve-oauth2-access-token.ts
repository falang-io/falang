import {
  buildOAuth2TokenRequest,
  type IIntegrationInstance,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import type { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';
import { getBackendEgress } from '../../net/egress-guard.js';
import { resolveFieldValue } from './credentials-codec.js';
import { resolveOAuth2ClientCredentials } from './resolve-oauth2-client-credentials.js';

const REFRESH_SKEW_MS = 60_000;

interface ITokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly [key: string]: unknown;
}

export interface IResolvedOAuth2AccessToken {
  readonly accessToken: string;
  /** The vendor's raw token response when a refresh just happened (ActivePieces pieces read extras off it), else `{}`. */
  readonly data: Record<string, unknown>;
  /** Set only when a refresh just happened — the caller persists it. */
  readonly refreshed?: {
    readonly accessToken: string;
    readonly refreshToken?: string;
    readonly expiresAt?: string;
    readonly oauthData: string;
  };
}

/**
 * Returns a valid access token for an OAuth2 instance, refreshing it on the backend when it is about
 * to expire. The platform's `client_id`/`client_secret` (`oauth_credentials`, ADR 0030 (private)) are
 * used here and never leave the backend — pods and the `activepieces` service only ever receive the
 * access token. See ADR 0016 (private) security audit P0-9.
 */
export const resolveOAuth2AccessToken = async (
  oauthCredentials: OAuthCredentialsService,
  integration: IWorkflowIntegration,
  instance: IIntegrationInstance,
  encryptionKey: Buffer,
  now: number = Date.now(),
): Promise<IResolvedOAuth2AccessToken> => {
  const config = integration.oauth2;
  if (!config) throw new Error(`Vendor "${integration.vendor}" has no OAuth2 config`);
  const read = (name: string): string | undefined => {
    const field = integration.credentialFields.find((candidate) => candidate.name === name);
    return field ? resolveFieldValue(instance, field, 'dev', encryptionKey) : '';
  };
  const accessToken = read('access_token');
  if (!accessToken) throw new Error('No access token configured — connect the account first');
  const refreshToken = read('refresh_token');
  const expiresAt = Number(read('expires_at')) || 0;
  if (expiresAt === 0 || now < expiresAt - REFRESH_SKEW_MS || !refreshToken) return { accessToken, data: {} };

  const client = await resolveOAuth2ClientCredentials(oauthCredentials, integration, instance, 'dev', encryptionKey);
  if (!client) throw new Error('OAuth2 client credentials are not configured');
  const params: Record<string, string> = { grant_type: 'refresh_token', refresh_token: refreshToken };
  if (config.includeRedirectUriOnRefresh) {
    const backendUrl = process.env.BACKEND_PUBLIC_URL;
    if (!backendUrl) throw new Error('BACKEND_PUBLIC_URL is not configured');
    params.redirect_uri = `${backendUrl}/oauth2/callback/${integration.vendor}`;
  }
  const accountDomain = config.accountDomainCallbackParam ? read('account_domain') || null : null;
  const { url, init } = buildOAuth2TokenRequest(config, client.clientId, client.clientSecret, params, accountDomain);
  const response = await getBackendEgress().fetch(url, init);
  if (!response.ok) throw new Error(`OAuth2 refresh failed for "${integration.vendor}": ${response.status}`);
  const tokens = (await response.json()) as ITokenResponse;
  return {
    accessToken: tokens.access_token,
    data: tokens,
    refreshed: {
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      ...(tokens.expires_in ? { expiresAt: String(now + tokens.expires_in * 1000) } : {}),
      oauthData: JSON.stringify(tokens),
    },
  };
};
