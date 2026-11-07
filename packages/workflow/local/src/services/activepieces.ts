import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureActivepiecesInstalled, findActivepiecesDir } from './activepieces-install.js';
import type { IEnsureInstalledParams } from './activepieces-install.js';
import { startSupervisedProcess } from './supervisor.js';
import type { ILocalService, ILocalServiceContext, ILocalServiceHandle } from './types.js';

export * from './activepieces-install.js';

/**
 * ActivePieces piece-adapter service (`activepieces/` at the repository root — not an npm workspace member, own
 * `package.json`/lockfile, see ADR 0010 (private)) as a local-mode service. Installs its dependencies with `npm ci`
 * when they are missing or older than its lockfile, then runs `src/main.ts` with its own `tsx` in one Node process.
 * Only works from a repository checkout: a packaged install has no `activepieces/` (desktop delivery is open).
 */

/** The `--import` URL of the service's own `tsx` (its version, its `tsconfig.json`). */
export const activepiecesTsxLoaderUrl = (dir: string): string =>
  pathToFileURL(createRequire(path.join(dir, 'package.json')).resolve('tsx')).href;

export interface IActivepiecesProcessEnvParams {
  readonly baseEnv: Readonly<NodeJS.ProcessEnv>;
  readonly port: number;
  readonly internalUrl: string;
  readonly secret: string;
  readonly testMode: boolean;
}

/**
 * The service process's environment. `NODE_ENV=test` registers the mock pieces and their `/mock*` routes; the mock
 * OAuth2 server is the service itself on `127.0.0.1`, reached both by the browser (authorize redirect) and by the
 * backend (token exchange — the local mode sets `EGRESS_ALLOW_PRIVATE=true`).
 */
export const buildActivepiecesProcessEnv = (params: IActivepiecesProcessEnvParams): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {
    ...params.baseEnv,
    PORT: String(params.port),
    BACKEND_INTERNAL_URL: params.internalUrl,
    ACTIVEPIECES_SERVICE_SECRET: params.secret,
    NODE_ENV: params.testMode ? 'test' : 'production',
  };
  if (params.testMode) env.MOCK_OAUTH_BASE_URL = `http://127.0.0.1:${params.port}/mock-oauth2`;
  else delete env.MOCK_OAUTH_BASE_URL;
  return env;
};

export interface IActivepiecesServiceDeps {
  readonly findDir?: () => Promise<string>;
  readonly ensureInstalled?: (params: IEnsureInstalledParams) => Promise<boolean>;
  readonly startProcess?: typeof startSupervisedProcess;
}

export const createActivepiecesService = (deps: IActivepiecesServiceDeps = {}): ILocalService => ({
  name: 'activepieces',
  start: async (ctx: ILocalServiceContext): Promise<ILocalServiceHandle> => {
    const dir = await (deps.findDir ?? findActivepiecesDir)();
    await (deps.ensureInstalled ?? ensureActivepiecesInstalled)({ dir, log: ctx.log });
    const port = await ctx.findFreePort();
    // A value the user exported wins in the backend (`??=`), so the service must use the same one.
    const secret = ctx.childEnv.ACTIVEPIECES_SERVICE_SECRET || (await ctx.getSecret('ACTIVEPIECES_SERVICE_SECRET'));
    const url = `http://127.0.0.1:${port}`;
    const child = await (deps.startProcess ?? startSupervisedProcess)({
      name: 'activepieces',
      command: process.execPath,
      args: ['--import', activepiecesTsxLoaderUrl(dir), 'src/main.ts'],
      cwd: dir,
      env: buildActivepiecesProcessEnv({
        baseEnv: ctx.childEnv,
        port,
        internalUrl: ctx.internalUrl,
        secret,
        testMode: ctx.testMode,
      }),
      log: ctx.log,
      // Loading ~60 piece packages through tsx takes a while, longer with a cold transpile cache.
      ready: { url: `${url}/health`, accept: (status) => status === 200 },
      readyTimeoutMs: 180_000,
      onUnexpectedExit: (error) => ctx.log(`[activepieces] ${error.message}`),
    });
    ctx.log(`[activepieces] listening on ${url}${ctx.testMode ? ' (mock pieces on)' : ''}`);
    return {
      // Runners get the URL too (`buildRunnerEnv`): they call the action `run` route with their project token.
      backendEnv: { ACTIVEPIECES_SERVICE_URL: url },
      // Backend -> service routes only; runner processes must never hold it (security audit P0-10).
      backendSecretEnv: { ACTIVEPIECES_SERVICE_SECRET: secret },
      testEnv: { ACTIVEPIECES_URL: url, ACTIVEPIECES_SERVICE_SECRET: secret },
      capabilities: ['activepieces'],
      stop: () => child.stop(),
    };
  },
});

export const activepiecesService: ILocalService = createActivepiecesService();
