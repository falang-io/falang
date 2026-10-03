import { createEgressConfigCache } from './config-cache.js';
import type { IEgressConfigCache } from './config-cache.js';
import { installEgressDispatcher } from './egress-dispatcher.js';
import { createInternalOriginMatcher } from './internal-origin.js';
import { installEgressAgents } from './tunnel-agents.js';
import { runWithEgressVendor } from './vendor-context.js';

export * from './types.js';
export * from './vendor-context.js';
export * from './internal-origin.js';
export * from './routing.js';
export * from './egress-dispatcher.js';
export * from './tunnel-agents.js';
export * from './config-cache.js';

let activeCache: IEgressConfigCache | null = null;

/**
 * Installs egress routing for the whole process: undici's global dispatcher (fetch) and the `http`/`https` global
 * agents (axios). Called once from `main.ts`. `BACKEND_INTERNAL_URL` is never proxied.
 */
export const installEgress = (env: NodeJS.ProcessEnv = process.env): { dispose(): void } => {
  const cache = createEgressConfigCache({ backendUrl: env.BACKEND_INTERNAL_URL });
  const options = { getConfig: () => cache.get(), isInternal: createInternalOriginMatcher([env.BACKEND_INTERNAL_URL]) };
  const dispatcher = installEgressDispatcher(options);
  const agents = installEgressAgents(options);
  activeCache = cache;
  return {
    dispose: () => {
      dispatcher.dispose();
      agents.dispose();
      if (activeCache === cache) activeCache = null;
    },
  };
};

/**
 * Runs a route's piece code on behalf of `activepieces-<pieceName>`: refreshes the proxy config first (30 s cache,
 * using the request's own project token) so the routing decision inside is synchronous. A no-op wrapper around
 * `fn` while routing isn't installed (unit tests).
 */
export const runWithPieceEgress = async <T>(
  pieceName: string,
  caller: { projectId?: string; internalProjectToken?: string },
  fn: () => Promise<T>,
): Promise<T> => {
  if (activeCache && caller.projectId && caller.internalProjectToken) {
    await activeCache.refresh(caller.projectId, caller.internalProjectToken);
  }
  return runWithEgressVendor(`activepieces-${pieceName}`, fn);
};
