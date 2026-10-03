// oxlint-disable max-lines, no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { generateKeyPairSync } from 'node:crypto';
import type { Connection, ConnectionOptions } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import type { ITemporalConfig } from './temporal-config.js';
import { TemporalTenancyService } from './temporal-tenancy.service.js';
import { TemporalTokenService } from './temporal-token.service.js';

const grpcError = (code: number, message = `grpc ${code}`): Error => Object.assign(new Error(message), { code });

const sharedConfig: ITemporalConfig = {
  mode: 'shared',
  address: 'temporal:7233',
  sharedNamespace: 'default',
  tls: false,
  retentionDays: 7,
  ensureTimeoutMs: 5000,
};

const perProjectConfig = (overrides: Partial<ITemporalConfig> = {}): ITemporalConfig => ({
  ...sharedConfig,
  mode: 'per-project',
  jwt: { privateKeyPem: '', ttlSeconds: 3600, audience: 'falang-temporal' },
  ...overrides,
});

const newTokens = (now: () => number = Date.now): TemporalTokenService =>
  new TemporalTokenService(
    {
      privateKeyPem: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string,
      ttlSeconds: 3600,
      audience: 'falang-temporal',
    },
    now,
  );

interface IFakeConnection {
  readonly connection: Connection;
  readonly workflowService: {
    registerNamespace: ReturnType<typeof vi.fn>;
    describeNamespace: ReturnType<typeof vi.fn>;
    listNamespaces: ReturnType<typeof vi.fn>;
  };
  readonly operatorService: { deleteNamespace: ReturnType<typeof vi.fn> };
  readonly close: ReturnType<typeof vi.fn>;
}

const fakeConnection = (): IFakeConnection => {
  const workflowService = {
    registerNamespace: vi.fn().mockResolvedValue({}),
    describeNamespace: vi.fn().mockResolvedValue({}),
    listNamespaces: vi.fn().mockResolvedValue({ namespaces: [] }),
  };
  const operatorService = { deleteNamespace: vi.fn().mockResolvedValue({}) };
  const close = vi.fn().mockResolvedValue(undefined);
  return {
    connection: { workflowService, operatorService, close } as unknown as Connection,
    workflowService,
    operatorService,
    close,
  };
};

const setup = (config: ITemporalConfig, fake = fakeConnection()) => {
  let clock = 1_000_000;
  const createdWith: ConnectionOptions[] = [];
  const sleeps: number[] = [];
  const tenancy = new TemporalTenancyService(
    config,
    config.mode === 'per-project' ? newTokens(() => clock) : undefined,
    {
      createConnection: (options) => {
        createdWith.push(options);
        return fake.connection;
      },
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
    },
  );
  return { tenancy, fake, createdWith, sleeps, advance: (ms: number) => (clock += ms) };
};

describe('TemporalTenancyService', () => {
  describe('namespaceFor', () => {
    it('is falang-<projectId> in per-project mode', () => {
      expect(setup(perProjectConfig()).tenancy.namespaceFor('p1')).toBe('falang-p1');
    });

    it('is the one configured namespace for every project in shared mode', () => {
      const { tenancy } = setup({ ...sharedConfig, sharedNamespace: 'prod' });

      expect(tenancy.namespaceFor('p1')).toBe('prod');
      expect(tenancy.namespaceFor('p2')).toBe('prod');
    });

    it('refuses to be built in per-project mode without a token service', () => {
      expect(() => new TemporalTenancyService(perProjectConfig())).toThrow(/TemporalTokenService/);
    });
  });

  describe('ensureNamespace', () => {
    it('registers the namespace with the configured retention, then waits until it is visible', async () => {
      const { tenancy, fake } = setup(perProjectConfig({ retentionDays: 3 }));

      await tenancy.ensureNamespace('p1');

      expect(fake.workflowService.registerNamespace).toHaveBeenCalledTimes(1);
      const request = fake.workflowService.registerNamespace.mock.calls[0]?.[0] as {
        namespace: string;
        workflowExecutionRetentionPeriod: { seconds: { toNumber(): number } | number };
      };
      expect(request.namespace).toBe('falang-p1');
      const seconds = request.workflowExecutionRetentionPeriod.seconds;
      expect(Number(typeof seconds === 'number' ? seconds : seconds.toNumber())).toBe(3 * 86_400);
      expect(fake.workflowService.describeNamespace).toHaveBeenCalledWith({ namespace: 'falang-p1' });
    });

    it('is idempotent: AlreadyExists is fine, and a known namespace is never registered again', async () => {
      const fake = fakeConnection();
      fake.workflowService.registerNamespace.mockRejectedValueOnce(grpcError(6, 'Namespace already exists'));
      const { tenancy } = setup(perProjectConfig(), fake);

      await tenancy.ensureNamespace('p1');
      await tenancy.ensureNamespace('p1');
      await tenancy.ensureNamespace('p1');

      expect(fake.workflowService.registerNamespace).toHaveBeenCalledTimes(1);
    });

    it('registers concurrent first calls once', async () => {
      const { tenancy, fake } = setup(perProjectConfig());

      await Promise.all([tenancy.ensureNamespace('p1'), tenancy.ensureNamespace('p1'), tenancy.ensureNamespace('p1')]);

      expect(fake.workflowService.registerNamespace).toHaveBeenCalledTimes(1);
    });

    it('retries NotFound from DescribeNamespace while the frontend cache catches up', async () => {
      const fake = fakeConnection();
      fake.workflowService.describeNamespace
        .mockRejectedValueOnce(grpcError(5, 'Namespace falang-p1 is not found'))
        .mockRejectedValueOnce(grpcError(5, 'Namespace falang-p1 is not found'))
        .mockResolvedValueOnce({});
      const { tenancy, sleeps } = setup(perProjectConfig(), fake);

      await tenancy.ensureNamespace('p1');

      expect(fake.workflowService.describeNamespace).toHaveBeenCalledTimes(3);
      expect(sleeps).toEqual([200, 200]);
    });

    it('retries a refused or unreachable Temporal (JWKS not loaded yet) until it answers', async () => {
      const fake = fakeConnection();
      fake.workflowService.registerNamespace
        .mockRejectedValueOnce(grpcError(16, 'Request unauthorized.'))
        .mockRejectedValueOnce(grpcError(14, 'connect ECONNREFUSED'))
        .mockResolvedValueOnce({});
      const { tenancy, sleeps } = setup(perProjectConfig(), fake);

      await tenancy.ensureNamespace('p1');

      expect(fake.workflowService.registerNamespace).toHaveBeenCalledTimes(3);
      expect(sleeps).toEqual([1000, 1000]);
    });

    it('gives up with the denial once the ensure timeout has passed, and does not cache the failure', async () => {
      const fake = fakeConnection();
      fake.workflowService.registerNamespace.mockRejectedValue(grpcError(7, 'Request unauthorized.'));
      const { tenancy } = setup(perProjectConfig({ ensureTimeoutMs: 3500 }), fake);

      await expect(tenancy.ensureNamespace('p1')).rejects.toThrow('Request unauthorized.');
      const attempts = fake.workflowService.registerNamespace.mock.calls.length;
      expect(attempts).toBeGreaterThan(1);

      fake.workflowService.registerNamespace.mockResolvedValue({});
      await tenancy.ensureNamespace('p1');
      expect(fake.workflowService.registerNamespace.mock.calls.length).toBe(attempts + 1);
    });

    it('does not retry an unrelated failure', async () => {
      const fake = fakeConnection();
      fake.workflowService.registerNamespace.mockRejectedValue(grpcError(3, 'invalid argument'));
      const { tenancy } = setup(perProjectConfig(), fake);

      await expect(tenancy.ensureNamespace('p1')).rejects.toThrow('invalid argument');
      expect(fake.workflowService.registerNamespace).toHaveBeenCalledTimes(1);
    });

    it('does nothing in shared mode', async () => {
      const { tenancy, fake, createdWith } = setup(sharedConfig);

      await tenancy.ensureNamespace('p1');

      expect(fake.workflowService.registerNamespace).not.toHaveBeenCalled();
      expect(createdWith).toHaveLength(0);
    });
  });

  describe('clients', () => {
    it('hands out one Client per namespace over one shared connection, and ensures the namespace first', async () => {
      const { tenancy, fake, createdWith } = setup(perProjectConfig());

      const a1 = await tenancy.getClient('a');
      const a2 = await tenancy.getClient('a');
      const b = await tenancy.getClient('b');

      expect(a1).toBe(a2);
      expect(a1).not.toBe(b);
      expect(a1.options.namespace).toBe('falang-a');
      expect(b.options.namespace).toBe('falang-b');
      expect(createdWith).toHaveLength(1);
      expect(fake.workflowService.registerNamespace).toHaveBeenCalledTimes(2);
    });

    it('getClientForNamespace never registers anything', async () => {
      const { tenancy, fake } = setup(perProjectConfig());

      const client = await tenancy.getClientForNamespace('falang-x');

      expect(client.options.namespace).toBe('falang-x');
      expect(fake.workflowService.registerNamespace).not.toHaveBeenCalled();
    });

    it('connects with a function-valued admin apiKey and tls: false in per-project mode', async () => {
      const { tenancy, createdWith } = setup(perProjectConfig());

      await tenancy.getClientForNamespace('falang-x');

      const options = createdWith[0] as ConnectionOptions;
      expect(options.address).toBe('temporal:7233');
      expect(options.tls).toBe(false);
      expect(typeof options.apiKey).toBe('function');
      const token = (options.apiKey as () => string)();
      const payload = JSON.parse(Buffer.from(token.split('.')[1] as string, 'base64url').toString()) as {
        permissions: string[];
      };
      expect(payload.permissions).toEqual(['temporal-system:admin']);
    });

    it('re-mints the admin token only once it is close to expiry', async () => {
      const { tenancy, createdWith, advance } = setup(perProjectConfig());
      await tenancy.getClientForNamespace('falang-x');
      const apiKey = (createdWith[0] as ConnectionOptions).apiKey as () => string;

      const first = apiKey();
      advance(60_000);
      expect(apiKey()).toBe(first);
      advance(200_000);
      expect(apiKey()).not.toBe(first);
    });

    it('uses TLS when TEMPORAL_TLS=true', async () => {
      const { tenancy, createdWith } = setup(perProjectConfig({ tls: true }));

      await tenancy.getClientForNamespace('falang-x');

      expect((createdWith[0] as ConnectionOptions).tls).toBe(true);
    });

    it('connects without any token in shared mode', async () => {
      const { tenancy, createdWith } = setup(sharedConfig);

      const client = await tenancy.getClient('p1');

      expect(client.options.namespace).toBe('default');
      expect(createdWith[0]).toEqual({ address: 'temporal:7233' });
    });

    it('closes the shared connection on shutdown', async () => {
      const { tenancy, fake } = setup(perProjectConfig());
      await tenancy.getClientForNamespace('falang-x');

      await tenancy.onModuleDestroy();

      expect(fake.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('listTenantNamespaces', () => {
    it('is just the shared namespace in shared mode', async () => {
      expect(await setup(sharedConfig).tenancy.listTenantNamespaces()).toEqual(['default']);
    });

    it('lists every falang-* namespace across pages and ignores the rest', async () => {
      const fake = fakeConnection();
      const page = (names: string[], next?: string) => ({
        namespaces: names.map((name) => ({ namespaceInfo: { name } })),
        nextPageToken: next ? Buffer.from(next) : new Uint8Array(),
      });
      fake.workflowService.listNamespaces
        .mockResolvedValueOnce(page(['default', 'falang-a', 'temporal-system'], 'more'))
        .mockResolvedValueOnce(page(['falang-b']));
      const { tenancy } = setup(perProjectConfig(), fake);

      expect(await tenancy.listTenantNamespaces()).toEqual(['falang-a', 'falang-b']);
      expect(fake.workflowService.listNamespaces).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteNamespace', () => {
    it('deletes through the operator service and forgets the namespace', async () => {
      const { tenancy, fake } = setup(perProjectConfig());
      await tenancy.ensureNamespace('p1');

      await tenancy.deleteNamespace('falang-p1');
      await tenancy.ensureNamespace('p1');

      expect(fake.operatorService.deleteNamespace).toHaveBeenCalledWith({ namespace: 'falang-p1' });
      expect(fake.workflowService.registerNamespace).toHaveBeenCalledTimes(2);
    });

    it('treats an already-missing namespace as deleted', async () => {
      const fake = fakeConnection();
      fake.operatorService.deleteNamespace.mockRejectedValue(grpcError(5, 'not found'));
      const { tenancy } = setup(perProjectConfig(), fake);

      await expect(tenancy.deleteNamespace('falang-gone')).resolves.toBeUndefined();
    });

    it('refuses to delete anything that is not a falang-* tenant namespace, and anything in shared mode', async () => {
      const { tenancy, fake } = setup(perProjectConfig());

      await expect(tenancy.deleteNamespace('default')).rejects.toThrow(/not a falang-\* tenant namespace/);
      await expect(setup(sharedConfig).tenancy.deleteNamespace('falang-x')).rejects.toThrow(/shared namespace/);
      expect(fake.operatorService.deleteNamespace).not.toHaveBeenCalled();
    });
  });
});
