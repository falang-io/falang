// oxlint-disable max-classes-per-file -- tiny Nest fixture classes, one per concern.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.js';
import { createApp } from './create-app.js';
import { JwtAuthGuard } from './domains/auth/auth/jwt-auth.guard.js';
import { Public } from './domains/auth/auth/public.decorator.js';
import { HealthModule } from './domains/health/health.module.js';
import { McpService } from './domains/mcp/mcp.service.js';
import { buildTestAppImports } from './test-utils/e2e-app.js';

@Controller('extra')
class ExtraController {
  @Public()
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Controller('internal/ping')
class InternalPingController {
  @Public()
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ExtraController, InternalPingController] })
class ExtraModule {}

const mountSpy = vi.fn();

/** `McpModule` pulls in `BuildModule` (a real kubeconfig at init time) — stubbed, as `mcp-test-harness.ts` also avoids it. */
@Module({ providers: [{ provide: McpService, useValue: { mount: mountSpy } }] })
class StubMcpModule {}

@Module({
  imports: buildTestAppImports([HealthModule, StubMcpModule, ExtraModule]),
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
class TestRootModule {}

describe('createApp', () => {
  let app: INestApplication | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    mountSpy.mockClear();
    vi.unstubAllEnvs();
  });

  it('boots with extra modules, keeps built-in routes, and mounts /mcp before init', async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    const created = await createApp({ appModule: TestRootModule });
    app = created;

    const ping = await request(created.getHttpServer()).get('/extra/ping');
    expect(ping.status).toBe(200);
    expect(ping.body).toEqual({ ok: true });

    const health = await request(created.getHttpServer()).get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    expect(mountSpy).toHaveBeenCalledTimes(1);
  });

  it('AppModule.forRoot appends extraModules after the built-in imports', () => {
    const dynamic = AppModule.forRoot({ extraModules: [ExtraModule] });
    expect(dynamic.module).toBe(AppModule);
    expect(dynamic.imports?.at(-1)).toBe(ExtraModule);
    expect(AppModule.forRoot().imports?.length).toBe((dynamic.imports?.length ?? 0) - 1);
  });
});

describe('createApp port split (internal API only on the internal port)', () => {
  let app: INestApplication | null = null;
  let internalServer: http.Server | null = null;

  afterEach(async () => {
    internalServer?.close();
    internalServer = null;
    await app?.close();
    app = null;
    vi.unstubAllEnvs();
  });

  it('serves /internal/* only on the internal port and public routes only on the public one', async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    const listen = (server: http.Server): Promise<number> =>
      new Promise((resolve) => {
        server.listen(0, () => resolve((server.address() as AddressInfo).port));
      });
    // Reserve a free port number for the internal listener before building the app.
    const probe = http.createServer();
    const internalPort = await listen(probe);
    probe.close();

    const created = await createApp({ appModule: TestRootModule, internalPort });
    app = created;
    await created.listen(0);
    const publicPort = (created.getHttpServer().address() as AddressInfo).port;
    internalServer = http.createServer(created.getHttpAdapter().getInstance());
    await new Promise<void>((resolve) => {
      internalServer?.listen(internalPort, resolve);
    });

    const statusOf = async (port: number, method: 'get' | 'post', path: string): Promise<number> => {
      const response = await request(`http://127.0.0.1:${port}`)[method](path);
      return response.status;
    };

    // internal route: 404 publicly (any spelling), a normal guarded answer internally
    expect(await statusOf(publicPort, 'get', '/internal/ping')).toBe(404);
    expect(await statusOf(publicPort, 'get', '/Internal/ping')).toBe(404);
    expect(await statusOf(publicPort, 'get', '//internal/ping')).toBe(404);
    expect(await statusOf(publicPort, 'post', '/internal/credentials/resolve')).toBe(404);
    expect(await statusOf(internalPort, 'get', '/internal/ping')).toBe(200);

    // public routes: fine publicly, 404 on the internal port (except /health)
    expect(await statusOf(publicPort, 'get', '/extra/ping')).toBe(200);
    expect(await statusOf(internalPort, 'get', '/extra/ping')).toBe(404);
    expect(await statusOf(internalPort, 'get', '/health')).toBe(200);
  });
});
