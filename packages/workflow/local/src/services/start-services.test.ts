// oxlint-disable init-declarations, no-undefined, unicorn/no-await-expression-member, unicorn/no-array-sort -- test code
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalService, LOCAL_SERVICES } from './index.js';
import { startLocalServices, type IStartLocalServicesParams } from './start-services.js';
import type { ILocalService, ILocalServiceContext, TLocalServiceName } from './types.js';

const fakeService = (
  name: TLocalServiceName,
  behaviour: { fail?: boolean; secret?: string } = {},
): ILocalService & { contexts: ILocalServiceContext[]; stop: ReturnType<typeof vi.fn> } => {
  const contexts: ILocalServiceContext[] = [];
  const stop = vi.fn(() => Promise.resolve());
  return {
    name,
    contexts,
    stop,
    start: async (ctx) => {
      contexts.push(ctx);
      if (behaviour.fail) throw new Error(`${name} failed to start`);
      const secret = behaviour.secret ? await ctx.getSecret(behaviour.secret) : null;
      return {
        backendEnv: { [`${name.toUpperCase().replaceAll('-', '_')}_URL`]: `http://127.0.0.1:1/${name}` },
        ...(secret ? { backendSecretEnv: { [behaviour.secret ?? '']: secret } } : {}),
        testEnv: { [`TEST_${name.toUpperCase().replaceAll('-', '_')}`]: 'yes' },
        capabilities: name === 'mailpit' ? ['mail'] : ['media'],
        stop,
      };
    },
  };
};

describe('local services registry', () => {
  it('declares every service name, none implemented in the shared step', () => {
    expect(Object.keys(LOCAL_SERVICES).sort()).toEqual(
      ['activepieces', 'egress-proxy', 'mailpit', 'media', 'mysql-user-db', 'postgres-user-db'].sort(),
    );
  });

  it('throws clearly for an unknown or an unimplemented service', () => {
    expect(() => getLocalService('redis')).toThrow('Unknown local service "redis"');
    expect(() => getLocalService('mailpit', { mailpit: null })).toThrow(
      'Local service "mailpit" is not implemented yet',
    );
    const service = fakeService('media');
    expect(getLocalService('media', { media: service })).toBe(service);
  });
});

describe('startLocalServices', () => {
  let dataDir: string;
  let params: IStartLocalServicesParams;
  let registry: Partial<Record<TLocalServiceName, ILocalService>>;
  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'falang-services-'));
    registry = {};
    params = {
      dataDir,
      log: () => null,
      publicUrl: 'http://localhost:4000',
      internalUrl: 'http://127.0.0.1:3001',
      testMode: true,
      childEnv: { PATH: '/bin' },
      resolve: (name) => getLocalService(name, registry),
    };
  });

  it('starts services in order with their context, merges env and status, and stops in reverse', async () => {
    const mailpit = fakeService('mailpit');
    const media = fakeService('media', { secret: 'MEDIA_SHARED_SECRET' });
    registry = { mailpit, media };
    const order: string[] = [];
    mailpit.stop.mockImplementation(() => {
      order.push('mailpit');
      return Promise.resolve();
    });
    media.stop.mockImplementation(() => {
      order.push('media');
      return Promise.resolve();
    });

    const started = await startLocalServices(['mailpit', 'media', 'mailpit'], params);
    expect(started.names).toEqual(['mailpit', 'media']);
    const ctx = mailpit.contexts[0];
    expect(ctx).toMatchObject({
      name: 'mailpit',
      dataDir: path.join(dataDir, 'services', 'mailpit'),
      rootDataDir: dataDir,
      publicUrl: 'http://localhost:4000',
      internalUrl: 'http://127.0.0.1:3001',
      testMode: true,
      childEnv: { PATH: '/bin' },
    });
    expect((await stat(path.join(dataDir, 'services', 'mailpit'))).isDirectory()).toBe(true);
    expect(await ctx?.findFreePort()).toBeGreaterThan(0);

    const secret = started.backendSecretEnv.MEDIA_SHARED_SECRET;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(await readFile(path.join(dataDir, 'secrets.json'), 'utf8')).MEDIA_SHARED_SECRET).toBe(secret);
    expect(started.backendEnv).toEqual({
      MAILPIT_URL: 'http://127.0.0.1:1/mailpit',
      MEDIA_URL: 'http://127.0.0.1:1/media',
    });
    expect(started.capabilities).toEqual(['mail', 'media']);
    expect(started.status).toEqual({
      mailpit: { testEnv: { TEST_MAILPIT: 'yes' }, capabilities: ['mail'] },
      media: { testEnv: { TEST_MEDIA: 'yes' }, capabilities: ['media'] },
    });

    await started.stop();
    await started.stop();
    expect(order).toEqual(['media', 'mailpit']);
  });

  it('stops what already started when a later service fails, and rethrows', async () => {
    const mailpit = fakeService('mailpit');
    registry = { mailpit, media: fakeService('media', { fail: true }) };
    await expect(startLocalServices(['mailpit', 'media'], params)).rejects.toThrow('media failed to start');
    expect(mailpit.stop).toHaveBeenCalledOnce();
  });

  it('starts nothing when a requested name is not implemented', async () => {
    const mailpit = fakeService('mailpit');
    registry = { mailpit };
    await expect(startLocalServices(['mailpit', 'activepieces'], params)).rejects.toThrow('Unknown local service');
    expect(mailpit.contexts).toHaveLength(0);
  });

  it('returns an empty result for no services', async () => {
    const started = await startLocalServices([], params);
    expect(started).toMatchObject({ names: [], backendEnv: {}, status: {}, capabilities: [] });
    await started.stop();
  });
});
