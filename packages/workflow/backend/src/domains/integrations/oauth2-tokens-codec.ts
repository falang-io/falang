import type { IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import { encryptSecret } from './credentials-crypto.js';

export interface IOAuth2TokenUpdate {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: string;
  readonly oauthData?: string;
  /** Captured once, at the initial connect, off the vendor's OAuth2-callback query param — see `IOAuth2Config.accountDomainCallbackParam`. Never re-sent on refresh (it doesn't change). */
  readonly accountDomain?: string;
}

/**
 * Mutates only the target instance's `access_token`/`refresh_token`/`expires_at`/`oauth_data`/
 * `account_domain` fields — used by the OAuth2 callback and the internal refresh-persist endpoint, both of which patch a
 * single field set on one instance from the backend itself, not from a client-submitted full
 * document. Deliberately bypasses `encodeIntegrationsDataForWrite`: that function's "diff an
 * incoming *complete* document against the previous one" semantics don't fit a server-originated
 * single-field patch. Every token is written into the `dev` slot only — `resolveFieldValue`'s
 * existing `secretProdOptional` fallback makes `prod` resolve to the same value, matching every
 * other call site in this adapter, which never resolves `env: 'prod'` (see ADR 0015 (private)).
 */
export const applyOAuth2TokensToInstance = (
  data: IIntegrationsDocumentData,
  credentialId: string,
  updates: IOAuth2TokenUpdate,
  encryptionKey: Buffer,
): IIntegrationsDocumentData => ({
  instances: data.instances.map((instance) => {
    if (instance.id !== credentialId) return instance;
    return {
      ...instance,
      fields: {
        ...instance.fields,
        access_token: { dev: encryptSecret(updates.accessToken, encryptionKey), prod: '' },
        ...(updates.refreshToken
          ? { refresh_token: { dev: encryptSecret(updates.refreshToken, encryptionKey), prod: '' } }
          : {}),
        ...(updates.expiresAt ? { expires_at: updates.expiresAt } : {}),
        ...(updates.oauthData ? { oauth_data: updates.oauthData } : {}),
        ...(updates.accountDomain ? { account_domain: updates.accountDomain } : {}),
      },
    };
  }),
});
