// oxlint-disable init-declarations, prefer-const -- test scenarios reassign the bot between steps.
// oxlint-disable no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping, max-lines-per-function -- test fakes and scenario-style cases.
import type {
  IIntegrationBackendContext,
  ISandboxBotAdapter,
  IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IIntegrationCredentialInstance, IIntegrationsDiscoveryPort } from './discovery-port.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';
import type { ISandboxIngressPort } from './sandbox-ingress-port.js';

const adapter = { tokenField: 'botToken' } as unknown as ISandboxBotAdapter;

const instance = (devSandbox: boolean): IIntegrationCredentialInstance => ({
  instanceId: 'cred-1',
  vendor: 'fakegram',
  projectId: 'p1',
  ...(devSandbox ? { devSandbox: true } : {}),
});

const discovery = (instances: () => IIntegrationCredentialInstance[], own: Record<string, string> | undefined) =>
  ({
    findCredentialInstances: vi.fn(() => Promise.resolve(instances())),
    resolveCredentialFields: vi.fn(() => Promise.resolve(own)),
    getDocumentsByType: vi.fn().mockResolvedValue([]),
    taskQueueFor: vi.fn((projectId: string, env: 'dev' | 'prod') => `q-${env}-${projectId}`),
    listProjectIds: vi.fn().mockResolvedValue([]),
  }) satisfies IIntegrationsDiscoveryPort;

interface IStarted {
  ctx: IIntegrationBackendContext;
  dispose: ReturnType<typeof vi.fn>;
}

const setup = (params: {
  instances: () => IIntegrationCredentialInstance[];
  own?: Record<string, string> | undefined;
  botFields: () => Record<string, string> | undefined;
}) => {
  const started: IStarted[] = [];
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((_target: unknown, _handler: unknown) => unsubscribe);
  const integration: IWorkflowIntegration = {
    vendor: 'fakegram',
    label: 'Fakegram',
    notes: 'Test vendor.',
    credentialFields: [],
    triggers: [],
    actions: [],
    sandbox: adapter,
    registerBackend: (ctx) => {
      const dispose = vi.fn().mockResolvedValue(undefined);
      started.push({ ctx, dispose });
      ctx.sharedIngress?.subscribe(() => Promise.resolve());
      return Promise.resolve(dispose);
    },
  };
  const runtime = new IntegrationsRuntimeService({
    integrations: [integration],
    discovery: discovery(params.instances, params.own),
    signalWorkflowWithStart: vi.fn(),
    publicHost: 'https://example.test',
  });
  const port: ISandboxIngressPort = { getBotFields: () => params.botFields(), subscribe };
  runtime.setSandboxIngress(port);
  return { runtime, started, subscribe, unsubscribe };
};

const boot = async (runtime: IntegrationsRuntimeService, env: 'dev' | 'prod' = 'dev'): Promise<void> => {
  runtime.onModuleInit();
  await vi.advanceTimersByTimeAsync(0);
  runtime.resumeProjectIntegrations('p1', env);
  await vi.advanceTimersByTimeAsync(0);
};

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsRuntimeService — sandbox mode', () => {
  it('starts the dev target on the shared bot: merged fields, no webhook URL, a shared ingress', async () => {
    vi.useFakeTimers();
    const { runtime, started, subscribe } = setup({
      instances: () => [instance(true)],
      own: { botToken: '', other: 'x' },
      botFields: () => ({ botToken: 'shared-token' }),
    });
    await boot(runtime);

    expect(started).toHaveLength(1);
    expect(started[0]?.ctx.fields).toEqual({ botToken: 'shared-token', other: 'x' });
    expect(started[0]?.ctx.webhookUrl).toBeNull();
    expect(started[0]?.ctx.sharedIngress).toBeDefined();
    expect(subscribe).toHaveBeenCalledWith(
      { vendor: 'fakegram', projectId: 'p1', credentialId: 'cred-1' },
      expect.any(Function),
    );
    await runtime.onModuleDestroy();
  });

  it('starts even when the instance has no own dev token', async () => {
    vi.useFakeTimers();
    const { runtime, started } = setup({
      instances: () => [instance(true)],
      own: undefined,
      botFields: () => ({ botToken: 'shared-token' }),
    });
    await boot(runtime);
    expect(started[0]?.ctx.fields).toEqual({ botToken: 'shared-token' });
    await runtime.onModuleDestroy();
  });

  it('does not start without a configured test bot, then starts once it appears', async () => {
    vi.useFakeTimers();
    let bot: Record<string, string> | undefined;
    const { runtime, started } = setup({
      instances: () => [instance(true)],
      own: { botToken: 'own' },
      botFields: () => bot,
    });
    await boot(runtime);
    expect(started).toHaveLength(0);

    bot = { botToken: 'shared-token' };
    await runtime.restartSandboxTargets('fakegram');
    expect(started).toHaveLength(1);
    expect(started[0]?.ctx.sharedIngress).toBeDefined();
    await runtime.onModuleDestroy();
  });

  it('never changes prod: own token, webhook URL, no shared ingress', async () => {
    vi.useFakeTimers();
    const { runtime, started } = setup({
      instances: () => [instance(true)],
      own: { botToken: 'own-prod' },
      botFields: () => ({ botToken: 'shared-token' }),
    });
    await boot(runtime, 'prod');
    expect(started).toHaveLength(1);
    expect(started[0]?.ctx.env).toBe('prod');
    expect(started[0]?.ctx.fields).toEqual({ botToken: 'own-prod' });
    expect(started[0]?.ctx.webhookUrl).toContain('/webhooks/fakegram/p1/cred-1/prod');
    expect(started[0]?.ctx.sharedIngress).toBeUndefined();
    await runtime.onModuleDestroy();
  });

  it('restarts the target when the test-bot token changes, and unsubscribes the old one', async () => {
    vi.useFakeTimers();
    let bot: Record<string, string> | undefined = { botToken: 'one' };
    const { runtime, started, unsubscribe } = setup({
      instances: () => [instance(true)],
      own: undefined,
      botFields: () => bot,
    });
    await boot(runtime);
    expect(started).toHaveLength(1);

    bot = { botToken: 'two' };
    await runtime.restartSandboxTargets('fakegram');
    expect(started).toHaveLength(2);
    expect(started[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(started[1]?.ctx.fields).toEqual({ botToken: 'two' });
    await runtime.onModuleDestroy();
  });

  it('stops the sandbox target when the test bot is removed, and an unchanged bot is not restarted', async () => {
    vi.useFakeTimers();
    let bot: Record<string, string> | undefined = { botToken: 'one' };
    const { runtime, started } = setup({
      instances: () => [instance(true)],
      own: { botToken: 'own' },
      botFields: () => bot,
    });
    await boot(runtime);
    await runtime.restartSandboxTargets('fakegram');
    expect(started).toHaveLength(1);

    bot = undefined;
    await runtime.restartSandboxTargets('fakegram');
    expect(started[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(started).toHaveLength(1);
    await runtime.onModuleDestroy();
  });

  it('switches back to the own token when devSandbox is turned off', async () => {
    vi.useFakeTimers();
    let sandbox = true;
    const { runtime, started } = setup({
      instances: () => [instance(sandbox)],
      own: { botToken: 'own-dev' },
      botFields: () => ({ botToken: 'shared-token' }),
    });
    await boot(runtime);
    expect(started[0]?.ctx.sharedIngress).toBeDefined();

    sandbox = false;
    await runtime.restartSandboxTargets('fakegram');
    expect(started).toHaveLength(2);
    expect(started[1]?.ctx.fields).toEqual({ botToken: 'own-dev' });
    expect(started[1]?.ctx.sharedIngress).toBeUndefined();
    await runtime.onModuleDestroy();
  });
});
