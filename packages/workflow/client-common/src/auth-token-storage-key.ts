/**
 * `localStorage` key of the signed-in user's access token. Dependency-free on purpose: the Electron shell
 * (`@falang/desktop-app-flow`) writes the token under this key to sign the window in.
 */
export const AUTH_TOKEN_STORAGE_KEY = 'falang-workflow-token';
