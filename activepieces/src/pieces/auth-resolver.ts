import type { Piece } from '@activepieces/pieces-framework';
import { resolveCredential } from '../credentials.js';
import { selectPieceAuth } from './select-auth.js';

interface IOAuth2AccessTokenResponse {
  readonly accessToken: string;
  readonly data?: Record<string, unknown>;
}

/**
 * Asks `backend` for a valid access token — it refreshes on its side with the platform's OAuth2
 * client secret (which must never reach this service or a runner pod) and persists the new tokens.
 * See ADR 0016 (private) security audit P0-9.
 */
const resolveOAuth2AuthValue = async (
  vendor: string,
  credentialId: string,
  projectId: string,
  internalProjectToken: string,
): Promise<unknown> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  if (!backendUrl) throw new Error('BACKEND_INTERNAL_URL is not configured');
  const response = await fetch(`${backendUrl}/internal/credentials/oauth2-access-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-project-token': internalProjectToken },
    body: JSON.stringify({ credentialId, vendor, projectId }),
  });
  if (!response.ok) {
    throw new Error(`OAuth2 access token resolve failed with status ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as IOAuth2AccessTokenResponse;
  return { type: 'OAUTH2', access_token: body.accessToken, data: body.data ?? {} };
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
  if (type === 'OAUTH2') return resolveOAuth2AuthValue(vendor, credentialId, projectId, internalProjectToken);
  throw new Error(`Unsupported auth type "${type}" for piece "${pieceName}" (see ADR 0010's scope)`);
};
