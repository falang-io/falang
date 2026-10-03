import { createHash } from 'node:crypto';

export interface IOAuth2CallbackPageParams {
  readonly status: 'success' | 'error';
  readonly credentialId: string;
  readonly message?: string;
  /**
   * Origin of the client app that opened the popup (`CLIENT_PUBLIC_URL`'s origin). `postMessage`'s
   * target origin — when unknown it falls back to `'*'`, acceptable only because the payload carries
   * no secrets (credentialId, status, a short message) and the receiver verifies `event.origin`.
   */
  readonly targetOrigin?: string;
}

export interface IRenderedOAuth2CallbackPage {
  readonly html: string;
  /** Value for the `Content-Security-Policy` header — `script-src` is the hash of the one static script, no `unsafe-inline`. */
  readonly contentSecurityPolicy: string;
}

export const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** Static: every dynamic value reaches it only through HTML-escaped `data-*` attributes, never through script text. */
const SCRIPT = `
    var d = document.body.dataset;
    if (window.opener) {
      window.opener.postMessage(
        { type: 'falang-oauth2-callback', credentialId: d.credentialId, status: d.status, message: d.message || undefined },
        d.targetOrigin || '*'
      );
    }
    window.close();
  `;

const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');

/**
 * Tiny self-closing HTML page served by the OAuth2 callback route — `postMessage`s the result to
 * `window.opener` (the popup's opener, see `oauth2-popup.ts` client-side) and closes itself. The page
 * is reachable unauthenticated with attacker-controlled query parameters (`error`, vendor error text),
 * so everything interpolated is HTML-escaped and the script is static, allowed by a CSP hash — see
 * ADR 0015 (private) and the 2026-10-01 security audit (P0-14).
 */
export const renderOAuth2CallbackPage = ({
  status,
  credentialId,
  message,
  targetOrigin,
}: IOAuth2CallbackPageParams): IRenderedOAuth2CallbackPage => {
  const text =
    status === 'success'
      ? 'Connected — you can close this window.'
      : `Connection failed: ${message ?? 'unknown error'}`;
  const attrs = [
    `data-status="${escapeHtml(status)}"`,
    `data-credential-id="${escapeHtml(credentialId)}"`,
    `data-message="${escapeHtml(message ?? '')}"`,
    `data-target-origin="${escapeHtml(targetOrigin ?? '')}"`,
  ].join(' ');
  return {
    html: `<!doctype html><html><head><meta charset="utf-8"><title>OAuth2</title></head><body ${attrs}><p>${escapeHtml(text)}</p><script>${SCRIPT}</script></body></html>`,
    contentSecurityPolicy: `default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  };
};
