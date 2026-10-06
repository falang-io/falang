// oxlint-disable max-classes-per-file -- tiny Nest fixture classes.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Controller, Get, Module, Param, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './create-app.js';
import { JwtAuthGuard } from './domains/auth/auth/jwt-auth.guard.js';
import { Public } from './domains/auth/auth/public.decorator.js';
import { HealthModule } from './domains/health/health.module.js';
import { MetricsModule } from './domains/metrics/metrics.module.js';
import { McpService } from './domains/mcp/mcp.service.js';
import { buildTestAppImports } from './test-utils/e2e-app.js';

@Controller('widgets')
class WidgetsController {
  @Public()
  @Get(':id')
  one(@Param('id') id: string): { id: string } {
    return { id };
  }
}

@Module({ controllers: [WidgetsController] })
class WidgetsModule {}

@Module({ providers: [{ provide: McpService, useValue: { mount: vi.fn() } }] })
class StubMcpModule {}

@Module({
  imports: buildTestAppImports([HealthModule, MetricsModule, WidgetsModule, StubMcpModule]),
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
class TestRootModule {}

const fetchOn = (port: number, path: string): Promise<{ status: number; type: string; body: string }> =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), body }));
      })
      .on('error', reject);
  });

describe('GET /internal/metrics', () => {
  let app: INestApplication | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
    vi.unstubAllEnvs();
  });

  it('is served on the internal port only, counts routes by template and sets x-request-id', async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    const internalServer = http.createServer();
    await new Promise<void>((resolve) => {
      internalServer.listen(0, '127.0.0.1', resolve);
    });
    const internalPort = (internalServer.address() as AddressInfo).port;
    const created = await createApp({ appModule: TestRootModule, internalPort });
    app = created;
    await created.listen(0);
    internalServer.on('request', created.getHttpAdapter().getInstance());
    const publicPort = (created.getHttpServer().address() as AddressInfo).port;

    const widget = await request(created.getHttpServer()).get('/widgets/abc-123').set('x-request-id', 'trace-1');
    expect(widget.status).toBe(200);
    expect(widget.headers['x-request-id']).toBe('trace-1');
    const other = await request(created.getHttpServer()).get('/widgets/zzz');
    expect(other.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    await request(created.getHttpServer()).get('/nope/123');
    await request(created.getHttpServer()).get('/health');

    const onPublic = await fetchOn(publicPort, '/internal/metrics');
    expect(onPublic.status).toBe(404);

    const metrics = await fetchOn(internalPort, '/internal/metrics');
    internalServer.close();
    expect(metrics.status).toBe(200);
    expect(metrics.type).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(metrics.body).toContain('falang_http_requests_total{method="GET",route="/widgets/:id",status="200"} 2');
    expect(metrics.body).toContain('falang_http_requests_total{method="GET",route="unmatched",status="404"}');
    expect(metrics.body).toContain(
      'falang_http_request_duration_seconds_bucket{le="+Inf",method="GET",route="/widgets/:id"} 2',
    );
    expect(metrics.body).not.toContain('abc-123');
    expect(metrics.body).not.toContain('route="/health"');
    expect(metrics.body).not.toContain('route="/internal/metrics"');
    for (const name of [
      'process_cpu_seconds_total',
      'process_resident_memory_bytes',
      'process_start_time_seconds',
      'nodejs_heap_size_used_bytes',
      'nodejs_eventloop_lag_p99_seconds',
    ]) {
      expect(metrics.body).toContain(`\n${name} `);
    }
  });
});
