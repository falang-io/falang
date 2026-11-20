import type { IIntegrationBackendContext, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IButtonWaitPort } from './button-wait-port.js';
import type { IIntegrationsDiscoveryPort } from './discovery-port.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';
import type { TSignalWorkflowRun } from './signal-workflow.js';

const discovery: IIntegrationsDiscoveryPort = {
  findCredentialInstances: vi
    .fn()
    .mockResolvedValue([{ instanceId: 'cred-1', vendor: 'telegram', projectId: 'project-1' }]),
  resolveCredentialFields: vi.fn().mockResolvedValue({ botToken: 'tok' }),
  getDocumentsByType: vi.fn().mockResolvedValue([]),
  taskQueueFor: vi.fn((projectId: string) => `workflow-dev-${projectId}`),
  listProjectIds: vi.fn().mockResolvedValue([]),
};

const start = async (params: {
  port?: IButtonWaitPort;
  signalWorkflowRun?: TSignalWorkflowRun;
  ensureRunnerRunning?: () => Promise<void>;
}): Promise<{ runtime: IntegrationsRuntimeService; ctx: IIntegrationBackendContext }> => {
  vi.useFakeTimers();
  const captured: { ctx?: IIntegrationBackendContext } = {};
  const integration: IWorkflowIntegration = {
    vendor: 'telegram',
    label: 'Telegram',
    notes: 'Test vendor.',
    credentialFields: [],
    triggers: [],
    actions: [],
    registerBackend: (ctx) => {
      captured.ctx = ctx;
      return Promise.resolve(() => Promise.resolve());
    },
  };
  const runtime = new IntegrationsRuntimeService({
    integrations: [integration],
    discovery,
    signalWorkflowWithStart: vi.fn().mockResolvedValue(null),
    ...(params.signalWorkflowRun ? { signalWorkflowRun: params.signalWorkflowRun } : {}),
  });
  if (params.port) runtime.setButtonWaits(params.port);
  if (params.ensureRunnerRunning) runtime.setEnsureRunnerRunning(params.ensureRunnerRunning);
  await runtime.onModuleInit();
  await vi.advanceTimersByTimeAsync(0);
  runtime.resumeProjectIntegrations('project-1', 'dev');
  await vi.advanceTimersByTimeAsync(0);
  if (!captured.ctx) throw new Error('registerBackend was not called');
  return { runtime, ctx: captured.ctx };
};

const delivery = {
  waitId: 'run-1:2',
  chatId: 42,
  messageId: '100',
  buttonIndex: 3,
  userId: 7,
  signalName: 'telegramButtonAnswer',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsRuntimeService — ctx.deliverToButtonWait', () => {
  it('claims the exact message, wakes the runner and plain-signals the known run', async () => {
    const calls: string[] = [];
    const port: IButtonWaitPort = {
      claim: vi.fn().mockResolvedValue({ waitId: 'run-1:2', workflowId: 'tg-doc', runId: 'run-1' }),
    };
    const signalWorkflowRun = vi.fn<TSignalWorkflowRun>().mockImplementation(() => {
      calls.push('signal');
      return Promise.resolve('delivered');
    });
    const { runtime, ctx } = await start({
      port,
      signalWorkflowRun,
      ensureRunnerRunning: () => {
        calls.push('wake');
        return Promise.resolve();
      },
    });

    await expect(ctx.deliverToButtonWait?.(delivery)).resolves.toBe(true);
    expect(port.claim).toHaveBeenCalledWith({
      projectId: 'project-1',
      env: 'dev',
      vendor: 'telegram',
      credentialId: 'cred-1',
      waitId: 'run-1:2',
      chatId: '42',
      messageId: '100',
    });
    expect(signalWorkflowRun).toHaveBeenCalledWith({
      projectId: 'project-1',
      workflowId: 'tg-doc',
      runId: 'run-1',
      signalName: 'telegramButtonAnswer',
      signalArgs: [{ waitId: 'run-1:2', buttonIndex: 3, userId: 7 }],
    });
    expect(calls).toEqual(['wake', 'signal']);
    await runtime.onModuleDestroy();
  });

  it('returns false for a missing wait or vanished run', async () => {
    const missing = await start({
      port: { claim: vi.fn().mockResolvedValue(null) },
      signalWorkflowRun: vi.fn<TSignalWorkflowRun>(),
    });
    await expect(missing.ctx.deliverToButtonWait?.(delivery)).resolves.toBe(false);
    expect(missing.ctx.deliverToButtonWait).toBeDefined();
    await missing.runtime.onModuleDestroy();

    const gone = await start({
      port: {
        claim: vi.fn().mockResolvedValue({ waitId: 'run-1:2', workflowId: 'tg-doc', runId: 'run-1' }),
      },
      signalWorkflowRun: vi.fn<TSignalWorkflowRun>().mockResolvedValue('gone'),
    });
    await expect(gone.ctx.deliverToButtonWait?.(delivery)).resolves.toBe(false);
    await gone.runtime.onModuleDestroy();
  });

  it('offers no method without a plain-signal function and returns false without a registry', async () => {
    const withoutSignal = await start({ port: { claim: vi.fn() } });
    expect(withoutSignal.ctx.deliverToButtonWait).toBeUndefined();
    await withoutSignal.runtime.onModuleDestroy();

    const withoutPort = await start({ signalWorkflowRun: vi.fn<TSignalWorkflowRun>() });
    await expect(withoutPort.ctx.deliverToButtonWait?.(delivery)).resolves.toBe(false);
    await withoutPort.runtime.onModuleDestroy();
  });
});
