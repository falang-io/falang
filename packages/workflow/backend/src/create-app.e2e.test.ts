// oxlint-disable max-classes-per-file -- tiny Nest fixture classes, one per concern.
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

@Module({ controllers: [ExtraController] })
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
