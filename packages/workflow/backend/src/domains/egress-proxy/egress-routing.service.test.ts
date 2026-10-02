import type { ConfigService } from '@nestjs/config';
import type * as egress from '@falang/workflow-egress';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EgressRoutingService } from './egress-routing.service.js';

const installEgressRouting = vi.fn();
const dispose = vi.fn();
vi.mock('@falang/workflow-egress', async (importOriginal) => ({
  ...(await importOriginal<typeof egress>()),
  installEgressRouting: (options: unknown) => {
    installEgressRouting(options);
    return { dispose };
  },
}));

const buildConfig = (env: Record<string, string>): ConfigService =>
  ({ get: (key: string) => env[key] }) as ConfigService;

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('EgressRoutingService', () => {
  it('refreshes, installs routing over the cached settings and disposes it', async () => {
    const cfg = { url: 'http://p:1', token: 't', vendors: ['telegram'] };
    const proxySettings = { refresh: vi.fn().mockResolvedValue(null), getCached: vi.fn(() => cfg) };
    const service = new EgressRoutingService(
      proxySettings as never,
      buildConfig({ ACTIVEPIECES_SERVICE_URL: 'http://activepieces:3000' }),
    );
    await service.onModuleInit();
    expect(proxySettings.refresh).toHaveBeenCalledTimes(1);
    const options = installEgressRouting.mock.calls[0]?.[0] as {
      getConfig: () => unknown;
      isInternal: (url: URL) => boolean;
    };
    expect(options.getConfig()).toBe(cfg);
    expect(options.isInternal(new URL('http://activepieces:3000/pieces'))).toBe(true);
    expect(options.isInternal(new URL('https://api.telegram.org/x'))).toBe(false);
    service.onModuleDestroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps going when a periodic refresh fails', async () => {
    vi.useFakeTimers();
    const proxySettings = {
      refresh: vi.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error('db')),
      getCached: vi.fn(),
    };
    const service = new EgressRoutingService(proxySettings as never, buildConfig({}));
    await service.onModuleInit();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(proxySettings.refresh).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it('installs nothing when EGRESS_ROUTING=off', async () => {
    const proxySettings = { refresh: vi.fn(), getCached: vi.fn() };
    const service = new EgressRoutingService(proxySettings as never, buildConfig({ EGRESS_ROUTING: 'off' }));
    await service.onModuleInit();
    expect(installEgressRouting).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
});
