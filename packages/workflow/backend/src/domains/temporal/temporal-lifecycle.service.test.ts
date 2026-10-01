// oxlint-disable no-undefined, unicorn/no-useless-undefined -- test fixtures: explicit "no value" mocks.
import { Connection, type ConnectionOptions } from '@temporalio/client';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsService } from '../admin/app-settings/app-settings.service.js';
import type { Project } from '../projects/projects/project.entity.js';
import type { ITemporalConfig } from './temporal-config.js';
import { TemporalLifecycleService } from './temporal-lifecycle.service.js';
import type { TemporalTenancyService } from './temporal-tenancy.service.js';

const config: ITemporalConfig = {
  mode: 'per-project',
  address: 'temporal:7233',
  sharedNamespace: 'default',
  tls: false,
  retentionDays: 7,
  ensureTimeoutMs: 1000,
  jwt: { privateKeyPem: '', ttlSeconds: 3600, audience: 'falang-temporal' },
};

const denied = (): Error => Object.assign(new Error('Request unauthorized.'), { code: 7 });

const makeService = (env: Record<string, string> = {}, tenancy: Partial<TemporalTenancyService> = {}) =>
  new TemporalLifecycleService(
    config,
    tenancy as TemporalTenancyService,
    { find: vi.fn().mockResolvedValue([{ id: 'live' }]) } as unknown as Repository<Project>,
    {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppSettingsService,
    { get: (key: string) => env[key] } as unknown as ConfigService,
  );

const stubConnections = (answer: () => Promise<unknown>) => {
  const created: ConnectionOptions[] = [];
  vi.spyOn(Connection, 'lazy').mockImplementation((options?: ConnectionOptions) => {
    created.push(options ?? {});
    return {
      withDeadline: (_deadline: number, fn: () => Promise<unknown>) => fn(),
      workflowService: { listNamespaces: vi.fn(answer) },
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Connection;
  });
  return created;
};

describe('TemporalLifecycleService.runSelfCheck', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes when Temporal refuses both a tokenless and a foreign-signed request', async () => {
    const created = stubConnections(() => Promise.reject(denied()));

    await expect(makeService().runSelfCheck()).resolves.toBeUndefined();

    // One probe without any token, one with a token the stack cannot verify.
    expect(created).toHaveLength(2);
    expect(created.some((options) => options.apiKey === undefined)).toBe(true);
    expect(created.some((options) => typeof options.apiKey === 'string')).toBe(true);
  });

  it('refuses to start, with a clear error, when Temporal answers without a valid token', async () => {
    stubConnections(() => Promise.resolve({ namespaces: [] }));

    await expect(makeService().runSelfCheck()).rejects.toThrow(/Temporal authorization is NOT enforced/);
  });

  it('only logs, and does not refuse to start, when Temporal stays unreachable until the timeout', async () => {
    stubConnections(() => Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 14 })));

    await expect(makeService({ TEMPORAL_SELF_CHECK_TIMEOUT_MS: '1' }).runSelfCheck()).resolves.toBeUndefined();
  });
});

describe('TemporalLifecycleService.onApplicationBootstrap', () => {
  it('does nothing in shared mode', async () => {
    const connectionSpy = vi.spyOn(Connection, 'lazy');
    const service = new TemporalLifecycleService(
      { ...config, mode: 'shared', jwt: undefined },
      {} as TemporalTenancyService,
      {} as Repository<Project>,
      {} as AppSettingsService,
      { get: () => undefined } as unknown as ConfigService,
    );

    await service.onApplicationBootstrap();
    service.onModuleDestroy();

    expect(connectionSpy).not.toHaveBeenCalled();
    connectionSpy.mockRestore();
  });
});

describe('TemporalLifecycleService.sweepOrphans', () => {
  it('never deletes the namespace of a live project, and only records a fresh orphan', async () => {
    const deleteNamespace = vi.fn().mockResolvedValue(undefined);
    const service = makeService({}, {
      listTenantNamespaces: vi.fn().mockResolvedValue(['falang-live', 'falang-dead']),
      deleteNamespace,
    } as unknown as Partial<TemporalTenancyService>);

    await service.sweepOrphans();

    expect(deleteNamespace).not.toHaveBeenCalled();
  });
});
