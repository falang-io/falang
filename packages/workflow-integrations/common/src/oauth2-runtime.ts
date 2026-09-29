import { buildOAuth2TokenRequest } from './oauth2-token-request.js';
import type { IOAuth2Config } from './oauth2-config.js';

const REFRESH_SKEW_MS = 60_000;

export type IOAuth2RuntimeConfig = Pick<
  IOAuth2Config,
  | 'tokenUrl'
  | 'authorizationMethod'
  | 'tokenRequestFormat'
  | 'accountDomainCallbackParam'
  | 'includeRedirectUriOnRefresh'
>;

interface ITokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
}

const resolveCredentialField = async (
  backendUrl: string,
  internalProjectToken: string,
  vendor: string,
  credentialId: string,
  projectId: string,
  field: string,
): Promise<string> => {
  const response = await fetch(`${backendUrl}/internal/credentials/resolve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-project-token': internalProjectToken },
    // OAuth2 tokens are only ever written to the `dev` slot — see `oauth2-tokens-codec.ts`'s doc comment.
    body: JSON.stringify({ credentialId, vendor, field, projectId, env: 'dev' }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to resolve ${vendor} credential ${credentialId}/${field}: ${response.status} ${await response.text()}`,
    );
  }
  const data = (await response.json()) as { value: string };
  return data.value;
};

/** Best-effort: the fresh token is still returned for this call even if persistence fails (e.g. `backend` unreachable). */
const persistRefreshedTokens = async (
  backendUrl: string,
  internalProjectToken: string,
  vendor: string,
  credentialId: string,
  projectId: string,
  tokens: ITokenResponse,
): Promise<void> => {
  try {
    await fetch(`${backendUrl}/internal/credentials/oauth2-refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-project-token': internalProjectToken },
      body: JSON.stringify({
        credentialId,
        vendor,
        projectId,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        ...(tokens.expires_in ? { expiresAt: String(Date.now() + tokens.expires_in * 1000) } : {}),
      }),
    });
  } catch {
    // best-effort — see doc comment above.
  }
};

/**
 * Resolves a native (non-ActivePieces) OAuth2 credential's access token at runner-activity runtime,
 * refreshing it against `config.tokenUrl` first if it's within `REFRESH_SKEW_MS` of expiry (or already
 * expired) and a refresh token is available — the native-path counterpart of
 * `activepieces/src/pieces/auth-resolver.ts`'s `resolveOAuth2AuthValue`, generalized so any vendor's
 * `IWorkflowIntegration.sharedActivityCode`/`IActionDescriptor.activityCode` can `import` it (see
 * `compile-activities.ts`'s `LOG_ACTIVITY_CODE` for the precedent of a real cross-package import
 * inside emitted activity code) instead of hand-rolling its own resolve+refresh fetch calls the way
 * `openai.integration.ts`'s `resolveOpenAiField` does for its own, simpler, non-OAuth2 fields.
 *
 * Field naming (`access_token`/`refresh_token`/`expires_at`/`client_id`/`client_secret`, plus
 * `account_domain` when `config.accountDomainCallbackParam` is set) matches `oauth2-tokens-codec.ts`'s
 * OAuth2 credential shape exactly, and `config` is expected to come straight from that vendor's own
 * `IWorkflowIntegration.oauth2`, inlined as a literal by the vendor's compiled activity code rather
 * than resolved at runtime — see ADR 0017 (private)'s "OAuth2
 * credential-kind gap".
 *
 * Reads `BACKEND_INTERNAL_URL`/`INTERNAL_PROJECT_TOKEN`/`PROJECT_ID` (and, only when
 * `config.includeRedirectUriOnRefresh` is set, `BACKEND_PUBLIC_URL`) from `process.env` inside this
 * function body (never at module scope) — see feedback memory on why a module-scope `process.env`
 * read in a package `@falang/workflow-client` barrel-imports would crash the browser bundle; this
 * function is only ever actually called from within the `runner` process.
 */
export const resolveOAuth2AccessToken = async (
  vendor: string,
  credentialId: string,
  config: IOAuth2RuntimeConfig,
): Promise<string> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;
  const projectId = process.env.PROJECT_ID;
  if (!backendUrl || !internalProjectToken || !projectId) {
    throw new Error(
      'BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process',
    );
  }

  const resolveField = (field: string): Promise<string> =>
    resolveCredentialField(backendUrl, internalProjectToken, vendor, credentialId, projectId, field);

  const [accessToken, refreshToken, expiresAtRaw, clientId, clientSecret, accountDomain] = await Promise.all([
    resolveField('access_token'),
    resolveField('refresh_token').catch(() => ''),
    resolveField('expires_at').catch(() => ''),
    resolveField('client_id'),
    resolveField('client_secret'),
    config.accountDomainCallbackParam ? resolveField('account_domain') : Promise.resolve(null),
  ]);

  const expiresAt = Number(expiresAtRaw) || 0;
  if (expiresAt === 0 || Date.now() < expiresAt - REFRESH_SKEW_MS || !refreshToken) {
    return accessToken;
  }

  const refreshParams: Record<string, string> = { grant_type: 'refresh_token', refresh_token: refreshToken };
  if (config.includeRedirectUriOnRefresh) {
    const backendPublicUrl = process.env.BACKEND_PUBLIC_URL;
    if (!backendPublicUrl) {
      throw new Error('BACKEND_PUBLIC_URL is not configured for this runner process (required for OAuth2 refresh)');
    }
    refreshParams.redirect_uri = `${backendPublicUrl}/oauth2/callback/${vendor}`;
  }
  const { url, init } = buildOAuth2TokenRequest(config, clientId, clientSecret, refreshParams, accountDomain);
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`OAuth2 refresh failed for "${vendor}": ${response.status}`);
  const refreshed = (await response.json()) as ITokenResponse;

  await persistRefreshedTokens(backendUrl, internalProjectToken, vendor, credentialId, projectId, refreshed);
  return refreshed.access_token;
};
