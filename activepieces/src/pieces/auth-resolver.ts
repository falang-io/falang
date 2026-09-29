import type { Piece } from '@activepieces/pieces-framework';
import { resolveCredential } from '../credentials.js';
import { selectPieceAuth } from './select-auth.js';

const REFRESH_SKEW_MS = 60_000;

interface IOAuth2Auth {
  readonly tokenUrl: string;
  readonly authorizationMethod?: 'HEADER' | 'BODY';
}

interface ITokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly [key: string]: unknown;
}

/** Same `application/x-www-form-urlencoded` shape `backend`'s `oauth2-token-request.ts` builds for
 * the authorization-code exchange — hand-duplicated since `activepieces/` shares no workspace
 * package with `backend` (see `catalog-types.ts`'s own doc comment for the existing precedent). */
const buildTokenRequest = (
  auth: IOAuth2Auth,
  clientId: string,
  clientSecret: string,
  params: Record<string, string>,
): { url: string; init: RequestInit } => {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (auth.authorizationMethod === 'HEADER') {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }
  return { url: auth.tokenUrl, init: { method: 'POST', headers, body } };
};

/** Best-effort: the fresh token is still used for this run even if persistence fails (e.g. `backend` unreachable). */
const persistRefreshedTokens = async (
  credentialId: string,
  vendor: string,
  projectId: string,
  internalProjectToken: string,
  tokens: ITokenResponse,
): Promise<void> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  if (!backendUrl) return;
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

const resolveOAuth2AuthValue = async (
  pieceName: string,
  auth: IOAuth2Auth,
  vendor: string,
  credentialId: string,
  projectId: string,
  internalProjectToken: string,
): Promise<unknown> => {
  const [accessToken, refreshToken, expiresAtRaw, clientId, clientSecret] = await Promise.all([
    resolveCredential(credentialId, vendor, 'access_token', projectId, internalProjectToken),
    resolveCredential(credentialId, vendor, 'refresh_token', projectId, internalProjectToken).catch(() => ''),
    resolveCredential(credentialId, vendor, 'expires_at', projectId, internalProjectToken).catch(() => ''),
    resolveCredential(credentialId, vendor, 'client_id', projectId, internalProjectToken),
    resolveCredential(credentialId, vendor, 'client_secret', projectId, internalProjectToken),
  ]);
  const expiresAt = Number(expiresAtRaw) || 0;
  if (expiresAt > 0 && Date.now() >= expiresAt - REFRESH_SKEW_MS && refreshToken) {
    const { url, init } = buildTokenRequest(auth, clientId, clientSecret, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`OAuth2 refresh failed for "${pieceName}": ${response.status}`);
    const refreshed = (await response.json()) as ITokenResponse;
    await persistRefreshedTokens(credentialId, vendor, projectId, internalProjectToken, refreshed);
    return { type: 'OAUTH2', access_token: refreshed.access_token, data: refreshed };
  }
  return { type: 'OAUTH2', access_token: accessToken, data: {} };
};

/**
 * Resolves a piece's `auth` value (whatever shape `context.auth` needs — `{type, secret_text}` for
 * SecretText, `{type, username, password}` for BasicAuth, `{type, props}` for CustomAuth, or
 * `{type, access_token, data}` for OAuth2 — `@activepieces/pieces-framework`'s `OAuth2PropertyValue`
 * only requires `access_token`/`data`, but ActivePieces' own engine hands pieces the stored
 * connection value, which carries `type` too, and multi-auth pieces branch on exactly that field
 * (`auth.type === 'CUSTOM_AUTH' ? auth.props.x : auth.access_token`, verified in the installed
 * Slack/Notion/HubSpot/SendGrid bundles), see ADR 0015 (private)) by fetching
 * each of that auth type's fields from `backend`'s internal credential resolver. Field names match
 * `activepieces/src/pieces/normalize.ts`'s `normalizeAuthFields` exactly, since that's what the
 * credential-add form (client-side) saved values under. For a multi-auth piece the method is the one
 * `selectPieceAuth` picks — the same choice `normalize.ts` made when it advertised the fields.
 *
 * `projectId`/`internalProjectToken` are per-project (see
 * ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth") and
 * simply forwarded to every `resolveCredential` call below — this service never mints them itself.
 */
export const resolveAuthValue = async (
  pieceName: string,
  piece: Piece,
  credentialId: string,
  projectId: string,
  internalProjectToken: string,
): Promise<unknown> => {
  const auth = selectPieceAuth(pieceName, piece);
  if (!auth) return undefined;

  const vendor = `activepieces-${pieceName}`;
  const type = String(auth['type']);

  if (type === 'SECRET_TEXT') {
    const secretText = await resolveCredential(credentialId, vendor, 'secret_text', projectId, internalProjectToken);
    return { type, secret_text: secretText };
  }
  if (type === 'BASIC_AUTH') {
    const [username, password] = await Promise.all([
      resolveCredential(credentialId, vendor, 'username', projectId, internalProjectToken),
      resolveCredential(credentialId, vendor, 'password', projectId, internalProjectToken),
    ]);
    return { type, username, password };
  }
  if (type === 'CUSTOM_AUTH') {
    const props = auth['props'] as Record<string, unknown> | undefined;
    const entries = await Promise.all(
      Object.keys(props ?? {}).map(
        async (name) =>
          [name, await resolveCredential(credentialId, vendor, name, projectId, internalProjectToken)] as const,
      ),
    );
    return { type, props: Object.fromEntries(entries) };
  }
  if (type === 'OAUTH2') {
    return resolveOAuth2AuthValue(
      pieceName,
      auth as unknown as IOAuth2Auth,
      vendor,
      credentialId,
      projectId,
      internalProjectToken,
    );
  }
  throw new Error(`Unsupported auth type "${type}" for piece "${pieceName}" (see ADR 0010's scope)`);
};
