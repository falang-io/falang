import { afterEach, describe, expect, it } from 'vitest';
import { startMocksServer, type IMocksServer } from './server.js';

describe('mock extension seam', () => {
  const started: IMocksServer[] = [];
  afterEach(async () => {
    await Promise.all(started.splice(0).map((s) => s.close()));
  });

  it('serves an extra mock and runs its reset hook on the service-wide reset', async () => {
    let resets = 0;
    const running = await startMocksServer({
      extraMocks: [
        (app, ctx) => {
          app.get('/ext/ping', (_req, res) => res.json({ ok: true }));
          ctx.reset(() => {
            resets += 1;
          });
        },
      ],
    });
    started.push(running);
    const address = running.server.address();
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

    const ping = await fetch(`${base}/ext/ping`);
    expect(ping.status).toBe(200);
    expect(await ping.json()).toEqual({ ok: true });
    const models = await fetch(`${base}/openai/models`);
    expect(models.status).toBe(200);

    const reset = await fetch(`${base}/__mock__/reset`, { method: 'POST' });
    expect(reset.status).toBe(200);
    expect(resets).toBe(1);
  });
});
