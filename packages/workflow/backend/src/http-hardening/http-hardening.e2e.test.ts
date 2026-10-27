// oxlint-disable max-classes-per-file, no-await-in-loop, no-void, init-declarations, unicorn/no-await-expression-member -- fixtures and sequential request loops.
import { Body, Controller, Get, Module, Post, Res, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../create-app.js';
import { JwtAuthGuard } from '../domains/auth/auth/jwt-auth.guard.js';
import { Public } from '../domains/auth/auth/public.decorator.js';
import { McpService } from '../domains/mcp/mcp.service.js';
import { buildTestAppImports } from '../test-utils/e2e-app.js';

@Controller()
class FixtureController {
  @Public()
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('own-csp')
  ownCsp(@Res() res: Response): void {
    res.set('Content-Security-Policy', "script-src 'sha256-x'").send('ok');
  }

  @Public()
  @Post('small')
  small(@Body() body: unknown): { ok: true } {
    void body;
    return { ok: true };
  }

  @Public()
  @Post('projects/import')
  importProject(@Body() body: unknown): { ok: true } {
    void body;
    return { ok: true };
  }
}

@Module({ controllers: [FixtureController] })
class FixtureModule {}

@Module({ providers: [{ provide: McpService, useValue: { mount: vi.fn() } }] })
class StubMcpModule {}

@Module({
  imports: buildTestAppImports([StubMcpModule, FixtureModule]),
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
class RootModule {}

describe('createApp http hardening', () => {
  let app: INestApplication | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
    vi.unstubAllEnvs();
  });
  const boot = async (env: Record<string, string> = {}): Promise<INestApplication> => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    app = await createApp({ appModule: RootModule });
    return app;
  };

  it('sets security headers, hides x-powered-by and keeps a route-provided CSP', async () => {
    const created = await boot();
    const res = await request(created.getHttpServer()).get('/ping');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeUndefined();
    const own = await request(created.getHttpServer()).get('/own-csp');
    expect(own.headers['content-security-policy']).toBe("script-src 'sha256-x'");
  });

  it('sends HSTS behind a trusted proxy that terminates TLS', async () => {
    const created = await boot({ TRUST_PROXY: '1' });
    const res = await request(created.getHttpServer()).get('/ping').set('X-Forwarded-Proto', 'https');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });

  it('restricts CORS to the configured origins', async () => {
    const created = await boot({ CORS_ORIGINS: 'https://app.example' });
    const ok = await request(created.getHttpServer()).get('/ping').set('Origin', 'https://app.example');
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.example');
    const other = await request(created.getHttpServer()).get('/ping').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('caps bodies at 256 KB except on the large-body routes', async () => {
    const created = await boot();
    const big = { text: 'x'.repeat(300 * 1024) };
    expect((await request(created.getHttpServer()).post('/small').send(big)).status).toBe(413);
    // The real (guarded) import route answers 401 without a token: what matters is that the body was accepted.
    expect((await request(created.getHttpServer()).post('/projects/import').send(big)).status).not.toBe(413);
  });

  it('answers 429 with Retry-After beyond the login limit and can be disabled', async () => {
    const created = await boot();
    let last = 0;
    let retryAfter: string | undefined;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(created.getHttpServer()).post('/auth/login').send({ username: 'Bob' });
      last = res.status;
      retryAfter = res.headers['retry-after'];
    }
    expect(last).toBe(429);
    expect(Number(retryAfter)).toBeGreaterThan(0);
    await created.close();
    const off = await boot({ RATE_LIMIT_ENABLED: 'false' });
    for (let i = 0; i < 12; i += 1) {
      expect((await request(off.getHttpServer()).post('/auth/login').send({ username: 'Bob' })).status).not.toBe(429);
    }
  });
});
