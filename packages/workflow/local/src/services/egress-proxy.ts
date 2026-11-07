// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { startSupervisedProcess, tsxEntryCommand } from './supervisor.js';
import type { ILocalService, ILocalServiceHandle } from './types.js';

/**
 * The repository's standalone forward proxy (`proxy/`, ADR 0056 (private)) as a local service — for the egress-proxy
 * e2e spec, which configures it in the product through `PUT /admin/settings/proxy` and reads its `GET /__stats`. Not
 * something a local install needs: a user who wants a proxy points the admin "Proxy" page at their own external one.
 * The proxy has no runtime dependencies, so it runs straight from the checkout (`node --import tsx proxy/src/main.ts`);
 * a packaged install has no `proxy/` and fails with a clear message.
 */

/** `<repo>/proxy/src/main.ts`, from this file's place in the checkout (`packages/workflow/local/src/services/`). */
export const defaultProxyEntry = (): string =>
  path.resolve(__dirname, '..', '..', '..', '..', '..', 'proxy', 'src', 'main.ts');

export interface IEgressProxyEnvParams {
  readonly port: number;
  readonly token: string;
  readonly testMode: boolean;
}

/**
 * The proxy's environment. Test mode allows every target port (the mocks listen on a random one) and exposes
 * `GET /__stats`; otherwise the proxy's own defaults stay (ports 443 and 80, no stats).
 */
export const buildEgressProxyEnv = (params: IEgressProxyEnvParams): Record<string, string> => ({
  HTTP_PORT: String(params.port),
  PROXY_TOKENS: params.token,
  ...(params.testMode ? { PROXY_ALLOWED_PORTS: '*', PROXY_EXPOSE_STATS: 'true' } : {}),
});

/** What the e2e process reads (`workflow-e2e-client.ts`): the proxy as the product should use it, its token, `/__stats`. */
export const buildEgressProxyTestEnv = (port: number, token: string): Record<string, string> => ({
  E2E_PROXY_URL: `http://127.0.0.1:${port}`,
  E2E_PROXY_TOKEN: token,
  E2E_PROXY_STATS_URL: `http://127.0.0.1:${port}`,
});

export interface IEgressProxyServiceDeps {
  /** Default `defaultProxyEntry()`; `FALANG_PROXY_ENTRY` in the environment overrides both. */
  readonly entry?: string;
  readonly exists?: (file: string) => boolean;
}

export const createEgressProxyService = (deps: IEgressProxyServiceDeps = {}): ILocalService => ({
  name: 'egress-proxy',
  start: async (ctx): Promise<ILocalServiceHandle> => {
    const entry = ctx.childEnv.FALANG_PROXY_ENTRY ?? deps.entry ?? defaultProxyEntry();
    if (!(deps.exists ?? existsSync)(entry)) {
      throw new Error(
        `egress-proxy: ${entry} not found — the proxy runs only from a repository checkout (its proxy/ directory); ` +
          'set FALANG_PROXY_ENTRY to its src/main.ts, or configure an external proxy on the admin "Proxy" page instead',
      );
    }
    const port = await ctx.findFreePort();
    const token = await ctx.getSecret('LOCAL_EGRESS_PROXY_TOKEN');
    const command = tsxEntryCommand(entry);
    const child = await startSupervisedProcess({
      name: 'egress-proxy',
      ...command,
      env: { ...ctx.childEnv, ...buildEgressProxyEnv({ port, token, testMode: ctx.testMode }) },
      // `tsx` picks up the proxy's own tsconfig.json from here.
      cwd: path.dirname(path.dirname(entry)),
      log: ctx.log,
      ready: { url: `http://127.0.0.1:${port}/health`, accept: (status) => status === 200 },
      readyTimeoutMs: 30_000,
      onUnexpectedExit: (error) => ctx.log(`[egress-proxy] ${error.message}`),
    });
    ctx.log(`[egress-proxy] listening on http://127.0.0.1:${port} (token in secrets.json: LOCAL_EGRESS_PROXY_TOKEN)`);
    return {
      testEnv: buildEgressProxyTestEnv(port, token),
      capabilities: ['egress-proxy'],
      stop: () => child.stop(),
    };
  },
});

export const egressProxyService: ILocalService = createEgressProxyService();
