// oxlint-disable no-console
import 'reflect-metadata';
import http from 'node:http';
import v8 from 'node:v8';
import { ValidationPipe } from '@nestjs/common';
import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, type TAppImport } from './app.module.js';
import { RunnerProcessManager } from './domains/build/build/runner-process-manager.js';
import { validateSecrets } from './config/validate-secrets.js';
import { McpService } from './domains/mcp/mcp.service.js';
import { httpMetricsMiddleware } from './observability/http-metrics.js';
import { createAppLogger } from './observability/json-logger.js';
import { requestIdMiddleware } from './observability/request-context.js';
import { portSplitMiddleware } from './port-split.js';

export interface ICreateAppOptions {
  /** Extra Nest modules appended to `AppModule.forRoot` (ignored when `appModule` is given). */
  extraModules?: TAppImport[];
  /** Port `startApp` listens on; defaults to the `PORT` env var, then 4000. */
  port?: number;
  /**
   * Port of the second, cluster-internal listener `startApp` opens; defaults to the `INTERNAL_PORT` env var, then 3001.
   * `createApp` itself only installs the port-split middleware (`/internal/*` served on this port only) when it is set.
   */
  internalPort?: number;
  /** Replaces `AppModule.forRoot({ extraModules })` as the root module — for test harnesses (e.g. an in-memory database). */
  appModule?: Type<unknown> | DynamicModule;
  /** Runs on the built app after every built-in pipe/parser/mount but before `app.init()`. */
  beforeInit?: (app: NestExpressApplication) => void | Promise<void>;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Only when this process was spawned for a coverage-instrumented e2e run (see
// ADR 0012 (private)) — no behavior change otherwise. A plain
// `docker compose down`'s `SIGTERM` (the stack's already-documented teardown step) would
// otherwise reach neither this process (see the ADR's note on `npm run start` not forwarding
// signals — this compose file's `backend` service overrides its `command` to avoid that) nor,
// transitively, this process's own coverage flush below.
//
// `stopEverything()`'s own relationship to coverage flushing changed once `runner` moved from a
// same-host child process to a k8s pod (ADR 0016 (private)'s Phase
// 2): deleting a Deployment doesn't wait for its pod to actually finish tearing down, and a pod's
// coverage now leaves it over HTTP (`push-coverage.ts` POSTing to `InternalCoverageController`,
// see that ADR's "Runner-pod coverage collection" implementation notes), not by sharing this
// process's `NODE_V8_COVERAGE` directory. `RUNNER_COVERAGE_FLUSH_GRACE_MS` below is how long this
// process stays alive after issuing the deletes, so those pods' own `SIGTERM` handlers have time to
// take and push their coverage before `app.close()`/`process.exit()` make this process stop
// accepting that push — a real wait, not the pre-Phase-2 500ms (which only ever needed to cover a
// same-host child flushing to a shared directory, never a network round trip through k8s pod
// deletion).
const RUNNER_COVERAGE_FLUSH_GRACE_MS = Number(process.env.RUNNER_COVERAGE_FLUSH_GRACE_MS ?? 5000);

const registerCoverageShutdownHook = (app: INestApplication): void => {
  if (!process.env.NODE_V8_COVERAGE) return;
  process.on('SIGTERM', () => {
    app
      .get(RunnerProcessManager)
      .stopEverything()
      .catch((error: unknown) =>
        console.error('@falang/workflow-backend failed to stop runner pods on shutdown:', error),
      )
      .then(() => delay(RUNNER_COVERAGE_FLUSH_GRACE_MS))
      .then(() => {
        v8.takeCoverage();
        return app.close();
      })
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error('@falang/workflow-backend coverage shutdown hook failed:', error);
        process.exit(1);
      });
  });
};

/**
 * Builds and initializes the application (everything short of `listen`). The single bootstrap path
 * shared by `main.ts` (`startApp`), a private overlay package composing extra modules, and tests.
 */
export const createApp = async (options: ICreateAppOptions = {}): Promise<NestExpressApplication> => {
  // After `AppModule.forRoot`'s `ConfigModule.forRoot` has loaded any `.env` file into `process.env`.
  const rootModule = options.appModule ?? AppModule.forRoot({ extraModules: options.extraModules });
  // `rawBody: true` populates `req.rawBody` (the exact original bytes) alongside Nest's normal
  // parsed `req.body` — needed by `@falang/workflow-gateway`'s `IntegrationWebhookController` to
  // reconstruct a faithful `Request` for each vendor's own `registerBackend` handler regardless of
  // wire format (JSON vs. Bitrix24's `application/x-www-form-urlencoded`), rather than re-serializing
  // whatever `@Body()` already parsed — see that controller's `dispatch()` doc comment and
  // ADR 0017 (private)'s "A real gap found along the way".
  validateSecrets();
  // `LOG_FORMAT=json` → one JSON object per line (with the request id inside a request); `LOG_LEVEL` filters — ADR 0060 (private).
  const logger = createAppLogger();
  const app = await NestFactory.create<NestExpressApplication>(rootModule, {
    rawBody: true,
    ...(logger ? { logger } : {}),
  });
  // No cookie-based session is used (auth is a bearer token the client attaches itself), so a
  // permissive CORS policy doesn't expose anything origin-specific.
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Express's default JSON body limit (100kb) is too small for `InternalCoverageController` — a
  // runner pod's own `NODE_V8_COVERAGE` output for even a small package like `@falang/workflow-
  // runner` was live-verified at 300-460KB (every script's per-function/per-range V8 coverage
  // counters add up fast). Bumped globally rather than per-route: every other body on this API is
  // small (workflow node trees, credential fields), so this only ever matters for that endpoint.
  app.useBodyParser('json', { limit: '15mb' });
  // Before every route (including the raw `/mcp` mount below): the request id (response header + async-local
  // context for the JSON logger) and the HTTP request counter/histogram.
  app.use(requestIdMiddleware);
  app.use(httpMetricsMiddleware);
  // Before every route (including the raw `/mcp` mount below): `/internal/*` must be unreachable on the public port.
  if (typeof options.internalPort === 'number') {
    app.use(portSplitMiddleware(options.internalPort));
  }
  // Mounted directly on the underlying Express instance, after Nest's own body parser is registered
  // above (so `req.body` is already populated for `/mcp` too) — see `McpService`'s own doc comment
  // for why this bypasses Nest's controller/guard pipeline entirely. Must happen before `app.init()`
  // (Nest's router 404s any later-mounted raw route).
  app.get(McpService).mount(app.getHttpAdapter().getInstance());
  await options.beforeInit?.(app);
  await app.init();
  return app;
};

/** `createApp` plus the coverage shutdown hook and `listen` — what `main.ts` runs. */
export const startApp = async (options: ICreateAppOptions = {}): Promise<NestExpressApplication> => {
  const port = options.port ?? Number(process.env.PORT ?? 4000);
  const internalPort = options.internalPort ?? Number(process.env.INTERNAL_PORT ?? 3001);
  if (internalPort === port) throw new Error('INTERNAL_PORT must differ from the public PORT');
  const app = await createApp({ ...options, internalPort });
  registerCoverageShutdownHook(app);
  await app.listen(port);
  // Same Express instance, second listener: `/internal/*` is served only here (see `portSplitMiddleware`).
  const internalServer = http.createServer(app.getHttpAdapter().getInstance());
  await new Promise<void>((resolve, reject) => {
    internalServer.once('error', reject);
    internalServer.listen(internalPort, resolve);
  });
  app.getHttpServer().once('close', () => internalServer.close());
  console.log(`@falang/workflow-backend listening on port ${port} (internal API on ${internalPort})`);
  return app;
};
