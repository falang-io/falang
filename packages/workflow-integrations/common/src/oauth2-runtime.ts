import type { IOAuth2Config } from './oauth2-config.js';

/**
 * The OAuth2 config a vendor's compiled activity code inlines as a literal. Kept as the third
 * argument of `resolveOAuth2AccessToken` so activity code compiled before the token refresh moved to
 * the backend still type-checks and runs; the runtime no longer reads it.
 */
export type IOAuth2RuntimeConfig = Pick<
  IOAuth2Config,
  | 'tokenUrl'
  | 'authorizationMethod'
  | 'tokenRequestFormat'
  | 'accountDomainCallbackParam'
  | 'includeRedirectUriOnRefresh'
>;

/**
 * Resolves a native (non-ActivePieces) OAuth2 credential's access token at runner-activity runtime
 * via `backend`'s `POST /internal/credentials/oauth2-access-token`, which refreshes the token there
 * when it is about to expire and persists the result. The pod never sees the OAuth2 client
 * `client_id`/`client_secret`: a platform-client vendor (amoCRM, ADR 0030 (private)) keeps them in
 * the admin app only and declares no such credential fields, and a bring-your-own-app vendor
 * (Diadoc) resolves them from the instance on the backend — the same endpoint the `activepieces`
 * service uses (`auth-resolver.ts`).
 *
 * Reads `BACKEND_INTERNAL_URL`/`INTERNAL_PROJECT_TOKEN`/`PROJECT_ID` from `process.env` inside this
 * function body (never at module scope) — see feedback memory on why a module-scope `process.env`
 * read in a package `@falang/workflow-client` barrel-imports would crash the browser bundle; this
 * function is only ever actually called from within the `runner` process.
 */
export const resolveOAuth2AccessToken = async (
  vendor: string,
  credentialId: string,
  _config?: IOAuth2RuntimeConfig,
): Promise<string> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;
  const projectId = process.env.PROJECT_ID;
  if (!backendUrl || !internalProjectToken || !projectId) {
    throw new Error(
      'BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process',
    );
  }

  const response = await fetch(`${backendUrl}/internal/credentials/oauth2-access-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-project-token': internalProjectToken },
    body: JSON.stringify({ credentialId, vendor, projectId }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to resolve ${vendor} access token for credential ${credentialId}: ${response.status} ${await response.text()}`,
    );
  }
  const data = (await response.json()) as { accessToken: string };
  return data.accessToken;
};
