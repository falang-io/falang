export interface IOAuth2CallbackPageParams {
  readonly status: 'success' | 'error';
  readonly credentialId: string;
  readonly message?: string;
}

/**
 * Tiny self-closing HTML page served by the OAuth2 callback route — `postMessage`s the result to
 * `window.opener` (the popup's opener, see `oauth2-popup.ts` client-side) and closes itself. Target
 * origin is `'*'`: the payload carries no secrets (just `credentialId`+status+a non-sensitive
 * message), and the receiving side verifies `event.origin` itself — see ADR 0015 (private).
 */
export const renderOAuth2CallbackPage = ({ status, credentialId, message }: IOAuth2CallbackPageParams): string => {
  const payload = JSON.stringify({ type: 'falang-oauth2-callback', credentialId, status, message });
  const text = status === 'success' ? 'Connected — you can close this window.' : `Connection failed: ${message ?? 'unknown error'}`;
  return `<!doctype html><html><body><p>${text}</p><script>
    if (window.opener) window.opener.postMessage(${payload}, '*');
    window.close();
  </script></body></html>`;
};
