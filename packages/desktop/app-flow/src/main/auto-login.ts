import { AUTH_TOKEN_STORAGE_KEY } from '@falang/workflow-client-common/src/auth-token-storage-key.js';
import type { BrowserWindow } from 'electron';
import type { ILocalStatus } from './status-file.js';

export const requestAutoLoginToken = async (status: ILocalStatus): Promise<string | null> => {
  try {
    const response = await fetch(`${status.internalUrl}/internal/local/auto-login`, {
      method: 'POST',
      headers: { 'x-local-control-token': status.controlToken },
    });
    if (!response.ok) return null;
    return ((await response.json()) as { accessToken?: string }).accessToken ?? null;
  } catch {
    return null;
  }
};

/** The script that stores the token where the client reads it on start. */
export const buildSetTokenScript = (token: string): string =>
  `localStorage.setItem(${JSON.stringify(AUTH_TOKEN_STORAGE_KEY)}, ${JSON.stringify(token)});`;

/**
 * Signs the window in as the seeded `admin` and opens the product. The token is written on the product's own origin (a
 * cheap `/health` page first), then the app is loaded; if anything fails the login form still works.
 */
export const openProductSignedIn = async (window: BrowserWindow, status: ILocalStatus): Promise<void> => {
  const token = await requestAutoLoginToken(status);
  if (token) {
    try {
      await window.loadURL(`${status.url}/health`);
      await window.webContents.executeJavaScript(buildSetTokenScript(token));
    } catch {
      // fall through to the plain load: the login form works
    }
  }
  await window.loadURL(status.url);
};
