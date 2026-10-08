import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';
import { ActivepiecesCatalogService } from '../integrations/activepieces-catalog.service.js';
import { DocumentsService } from '../projects/documents/documents.service.js';
import { FoldersService } from '../projects/folders/folders.service.js';
import { ProjectExportService } from '../projects/export/project-export.service.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { PersonalAccessTokensService } from '../auth/personal-access-tokens/personal-access-tokens.service.js';
import type { BuildService } from '../build/build/build.service.js';
import type { DebugService } from '../build/debug/debug.service.js';
import type { RunsService } from '../runs/runs.service.js';
import { createTestApp } from '../../test-utils/e2e-app.js';
import { McpService } from './mcp.service.js';

export interface IMcpTestApp {
  readonly app: INestApplication;
  readonly url: string;
  close(): Promise<void>;
}

/**
 * `createTestApp()` (shared with every other `*.e2e.test.ts` in this package) deliberately never
 * imports `BuildModule`/`RunsModule` — those pull in `RunnerProcessManager`'s real
 * `KubeConfig().loadFromDefault()` at module-init time, which throws outside a real cluster/kubeconfig
 * (see `build.module.ts`). None of the HTTP-level `/mcp` tests this harness backs exercise a
 * build/debug/run tool's *handler* — `registerWorkflowMcpTools` only closes over these at
 * registration time, never calling into them until a tool is actually invoked — so `BuildService`/
 * `DebugService`/`RunsService` are passed as untyped stubs instead of resolving the real (k8s-backed)
 * providers. `McpService` itself is constructed directly (not through Nest DI) for the same reason:
 * `McpModule` imports `BuildModule`, which this harness must avoid.
 *
 * Mounted via `createTestApp`'s `beforeInit` hook (not after `createTestApp()` returns) — Nest's own
 * router, attached during `app.init()`, terminates any unmatched request with a 404 rather than
 * falling through to Express middleware registered afterward, so `/mcp` has to exist before `init()`
 * runs, exactly the order `main.ts` already uses (`McpService.mount()` before `app.listen()`, which
 * triggers `init()` internally).
 */
export const createMcpTestApp = async (): Promise<IMcpTestApp> => {
  const app = await createTestApp((nestApp) => {
    const mcpService = new McpService(
      nestApp.get(ProjectsService),
      nestApp.get(DocumentsService),
      nestApp.get(FoldersService),
      nestApp.get(ProjectExportService),
      {} as BuildService,
      {} as DebugService,
      {} as RunsService,
      nestApp.get(ActivepiecesCatalogService),
      nestApp.get(PersonalAccessTokensService),
      nestApp.get(OAuthCredentialsService),
    );
    mcpService.mount(nestApp.getHttpAdapter().getInstance());
  });

  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/mcp`;

  return {
    app,
    url,
    close: () => app.close(),
  };
};
