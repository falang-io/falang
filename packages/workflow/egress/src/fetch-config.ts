import type { IEgressProxyConfig } from './types.js';

/**
 * Loads the proxy config for a project from `backend`'s internal route. The request itself is internal: its origin
 * must be in the caller's `isInternal`, otherwise it could be tunnelled through the proxy it is trying to configure.
 */
export const fetchEgressProxyConfig = async (params: {
  backendUrl: string;
  projectId: string;
  projectToken: string;
  fetchImpl?: typeof fetch;
}): Promise<IEgressProxyConfig | null> => {
  const doFetch = params.fetchImpl ?? fetch;
  const url = `${params.backendUrl.replace(/\/+$/, '')}/internal/egress-proxy/${encodeURIComponent(params.projectId)}`;
  const response = await doFetch(url, { headers: { 'x-internal-project-token': params.projectToken } });
  if (!response.ok) throw new Error(`GET ${url} failed with status ${response.status}`);
  const body = (await response.json()) as { proxy?: IEgressProxyConfig | null };
  return body.proxy ?? null;
};
