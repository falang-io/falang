// oxlint-disable unicorn/no-await-expression-member, init-declarations, no-bitwise, unicorn/no-array-sort, no-undefined, no-void, no-promise-executor-return
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_ROUTE_PATTERN, CLIENT_CSP, createClientMiddleware } from './serve-client.js';

describe('createClientMiddleware', () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'falang-client-'));
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<main>index</main>');
    await writeFile(path.join(dir, 'admin.html'), '<main>admin</main>');
    await writeFile(path.join(dir, 'assets', 'x.js'), 'console.log(1)');
    const app = express();
    app.use(...createClientMiddleware(dir));
    app.use((_req, res) => res.status(404).send('api-fallthrough'));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const get = async (p: string, accept = 'text/html') => {
    const res = await fetch(base + p, { headers: { accept } });
    return { res, text: await res.text() };
  };

  it('serves index.html on / and admin.html on /admin[/...] for html navigations', async () => {
    expect((await get('/')).text).toContain('index');
    expect((await get('/admin')).text).toContain('admin');
    expect((await get('/admin/users')).text).toContain('admin');
  });

  it('does not rewrite API-like paths or non-html requests', async () => {
    expect((await get('/projects')).text).toBe('api-fallthrough');
    expect((await get('/admin-api')).text).toBe('api-fallthrough');
    expect((await get('/admin/x.json')).text).toBe('api-fallthrough');
    expect((await get('/', 'application/json')).text).toBe('api-fallthrough');
  });

  it('sets the CSP on pages and assets, and serves static files', async () => {
    const page = await get('/');
    expect(page.res.headers.get('content-security-policy')).toBe(CLIENT_CSP);
    const asset = await get('/assets/x.js', '*/*');
    expect(asset.text).toBe('console.log(1)');
    expect(asset.res.headers.get('content-security-policy')).toBe(CLIENT_CSP);
    expect((await get('/projects')).res.headers.get('content-security-policy')).toBeNull();
  });

  it('ignores non-GET requests', async () => {
    const res = await fetch(`${base}/`, { method: 'POST', headers: { accept: 'text/html' } });
    expect(await res.text()).toBe('api-fallthrough');
  });

  it('ADMIN_ROUTE_PATTERN matches only /admin and sub-paths without dots', () => {
    expect(ADMIN_ROUTE_PATTERN.test('/admin')).toBe(true);
    expect(ADMIN_ROUTE_PATTERN.test('/admin/a/b')).toBe(true);
    expect(ADMIN_ROUTE_PATTERN.test('/administrator')).toBe(false);
  });
});
