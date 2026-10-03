import type { IEgressProxyConfig } from './types.js';

export interface IEgressConfigCache {
  /** Synchronous view of the last good value (what the routing code reads). */
  get(): IEgressProxyConfig | null;
  /** Re-fetches unless the cached value is younger than the TTL. Never rejects; failure keeps the last good value. */
  refresh(projectId: string, projectToken: string): Promise<void>;
}

/**
 * The proxy config is platform-wide, so one cached value serves every request; each refresh authenticates with the
 * calling request's own project token. One warning per failure streak.
 */
export const createEgressConfigCache = (params: {
  backendUrl: string | undefined;
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): IEgressConfigCache => {
  const ttl = params.ttlMs ?? 30_000;
  const now = params.now ?? Date.now;
  let current: IEgressProxyConfig | null = null;
  let fetchedAt = -Infinity;
  let inFlight: Promise<void> | null = null;
  let failing = false;

  const load = async (projectId: string, token: string): Promise<void> => {
    try {
      if (!params.backendUrl) throw new Error('BACKEND_INTERNAL_URL is not configured');
      const url = `${params.backendUrl.replace(/\/+$/, '')}/internal/egress-proxy/${encodeURIComponent(projectId)}`;
      const response = await (params.fetchImpl ?? fetch)(url, { headers: { 'x-internal-project-token': token } });
      if (!response.ok) throw new Error(`GET ${url} failed with status ${response.status}`);
      const body = (await response.json()) as { proxy?: IEgressProxyConfig | null };
      current = body.proxy ?? null;
      fetchedAt = now();
      failing = false;
    } catch (error) {
      // oxlint-disable-next-line no-console -- one warning per failure streak; this service has no logging framework
      if (!failing) console.warn('[egress] failed to load proxy config, keeping the last value:', error);
      failing = true;
      fetchedAt = now(); // do not hammer a failing backend on every request
    }
  };

  return {
    get: () => current,
    refresh: async (projectId, token) => {
      if (!token || now() - fetchedAt < ttl) return;
      inFlight ??= load(projectId, token).finally(() => {
        inFlight = null;
      });
      await inFlight;
    },
  };
};
