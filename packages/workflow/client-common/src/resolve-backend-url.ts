export const DEFAULT_BACKEND_URL = 'http://localhost:4000';

/**
 * Backend origin for the client. `VITE_BACKEND_URL=same-origin` (ADR 0072 (private): local mode serves the built client
 * from the backend's own port) means the page's own origin; unset falls back to the dev default.
 */
export const resolveBackendUrl = (envValue: string | null | undefined, origin: string | null): string => {
  if (envValue === 'same-origin') return origin ?? DEFAULT_BACKEND_URL;
  return envValue ?? DEFAULT_BACKEND_URL;
};
