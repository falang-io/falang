export interface IOAuth2PopupResult {
  readonly status: 'success' | 'error';
  readonly message?: string;
}

interface IOAuth2CallbackMessage {
  readonly type?: string;
  readonly credentialId?: string;
  readonly status?: 'success' | 'error';
  readonly message?: string;
}

/**
 * Opens the vendor's consent screen in a popup and resolves once the backend's callback page
 * (`renderOAuth2CallbackPage`) `postMessage`s a result back, or the popup is closed before that
 * happens. The origin check is the real security boundary: the callback page is served by our own
 * backend, so `event.origin` genuinely equals `backendOrigin` — no other page can spoof it. See
 * ADR 0015 (private).
 */
export const openOAuth2Popup = (
  authorizeUrl: string,
  credentialId: string,
  backendOrigin: string,
): Promise<IOAuth2PopupResult> =>
  new Promise((resolve) => {
    const popup = window.open(authorizeUrl, 'falang-oauth2-connect', 'width=600,height=700');
    if (!popup) {
      resolve({ status: 'error', message: 'Popup blocked — allow popups and try again.' });
      return;
    }
    let settled = false;
    let intervalId = 0;
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== backendOrigin || settled) return;
      const data = event.data as IOAuth2CallbackMessage | null;
      if (data?.type !== 'falang-oauth2-callback' || data.credentialId !== credentialId) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      globalThis.clearInterval(intervalId);
      resolve({ status: data.status ?? 'error', message: data.message });
    };
    window.addEventListener('message', onMessage);
    // Cast: this monorepo's ambient types resolve `setInterval`'s return type to Node's `Timeout`
    // even in browser-only client code — `clearInterval` accepts either shape at runtime.
    intervalId = globalThis.setInterval(() => {
      if (!popup.closed || settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      globalThis.clearInterval(intervalId);
      resolve({ status: 'error', message: 'Connection window was closed before completing.' });
    }, 500) as unknown as number;
  });
