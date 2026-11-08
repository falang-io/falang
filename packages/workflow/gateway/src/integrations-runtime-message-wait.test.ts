import type { IIntegrationBackendContext, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IIntegrationsDiscoveryPort } from './discovery-port.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';
import type { IMessageWaitPort } from './message-wait-port.js';
import { RunnerStartRefusedError } from './runner-start-refused-error.js';
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

/** Boots the runtime with one Telegram dev target and hands back that target's ctx. */
const startWithCtx = async (params: {
  signalWorkflowRun?: TSignalWorkflowRun;
  port?: IMessageWaitPort;
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
  if (params.port) runtime.setMessageWaits(params.port);
  if (params.ensureRunnerRunning) runtime.setEnsureRunnerRunning(params.ensureRunnerRunning);
  await runtime.onModuleInit();
  await vi.advanceTimersByTimeAsync(0);
  runtime.resumeProjectIntegrations('project-1', 'dev');
  await vi.advanceTimersByTimeAsync(0);
  if (!captured.ctx) throw new Error('registerBackend was not called');
  return { runtime, ctx: captured.ctx };
};

const claimed = { waitId: 'wait-1', workflowId: 'tg-doc-1', runId: 'run-1' };
const delivery = (buildMessage = vi.fn().mockResolvedValue({ text: 'Ann' })) => ({
  chatId: 42,
  userId: 7,
  signalName: 'telegramReply',
  buildMessage,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsRuntimeService — ctx.deliverToMessageWait (ADR 0079)', () => {
  it('claims the wait for the chat and sender, wakes the runner, then plain-signals the run', async () => {
    const calls: string[] = [];
    const port: IMessageWaitPort = { claim: vi.fn().mockResolvedValue(claimed) };
    const signalWorkflowRun = vi.fn<TSignalWorkflowRun>().mockImplementation(() => {
      calls.push('signal');
      return Promise.resolve('delivered');
    });
    const { runtime, ctx } = await startWithCtx({
      port,
      signalWorkflowRun,
      ensureRunnerRunning: () => {
        calls.push('wake');
        return Promise.resolve();
      },
    });

    await expect(ctx.deliverToMessageWait?.(delivery())).resolves.toBe(true);

    expect(port.claim).toHaveBeenCalledWith({
      projectId: 'project-1',
      env: 'dev',
      vendor: 'telegram',
      credentialId: 'cred-1',
      chatId: '42',
      userId: '7',
    });
    expect(signalWorkflowRun).toHaveBeenCalledWith({
      projectId: 'project-1',
      workflowId: 'tg-doc-1',
      runId: 'run-1',
      signalName: 'telegramReply',
      signalArgs: [{ waitId: 'wait-1', message: { text: 'Ann' } }],
    });
    expect(calls).toEqual(['wake', 'signal']);
    await runtime.onModuleDestroy();
  });

  it('answers false without building the message when nobody waits', async () => {
    const buildMessage = vi.fn();
    const signalWorkflowRun = vi.fn<TSignalWorkflowRun>();
    const { runtime, ctx } = await startWithCtx({
      port: { claim: vi.fn().mockResolvedValue(null) },
      signalWorkflowRun,
    });

    await expect(ctx.deliverToMessageWait?.(delivery(buildMessage))).resolves.toBe(false);
    expect(buildMessage).not.toHaveBeenCalled();
    expect(signalWorkflowRun).not.toHaveBeenCalled();
    await runtime.onModuleDestroy();
  });

  it('answers false when the waiting run is gone, or when the signal fails', async () => {
    const gone = await startWithCtx({
      port: { claim: vi.fn().mockResolvedValue(claimed) },
      signalWorkflowRun: vi.fn<TSignalWorkflowRun>().mockResolvedValue('gone'),
    });
    await expect(gone.ctx.deliverToMessageWait?.(delivery())).resolves.toBe(false);
    await gone.runtime.onModuleDestroy();

    const failing = await startWithCtx({
      port: { claim: vi.fn().mockResolvedValue(claimed) },
      signalWorkflowRun: vi.fn<TSignalWorkflowRun>().mockRejectedValue(new Error('temporal down')),
    });
    await expect(failing.ctx.deliverToMessageWait?.(delivery())).resolves.toBe(false);
    await failing.runtime.onModuleDestroy();
  });

  it('rethrows a refused wake (suspended project) without signalling', async () => {
    const signalWorkflowRun = vi.fn<TSignalWorkflowRun>();
    const { runtime, ctx } = await startWithCtx({
      port: { claim: vi.fn().mockResolvedValue(claimed) },
      signalWorkflowRun,
      ensureRunnerRunning: () => Promise.reject(new RunnerStartRefusedError('suspended')),
    });

    await expect(ctx.deliverToMessageWait?.(delivery())).rejects.toBeInstanceOf(RunnerStartRefusedError);
    expect(signalWorkflowRun).not.toHaveBeenCalled();
    await runtime.onModuleDestroy();
  });

  it('answers false while no registry is installed, and offers no method without a plain-signal function', async () => {
    const withoutPort = await startWithCtx({ signalWorkflowRun: vi.fn<TSignalWorkflowRun>() });
    await expect(withoutPort.ctx.deliverToMessageWait?.(delivery())).resolves.toBe(false);
    await withoutPort.runtime.onModuleDestroy();

    const withoutSignal = await startWithCtx({ port: { claim: vi.fn() } });
    expect(withoutSignal.ctx.deliverToMessageWait).toBeUndefined();
    await withoutSignal.runtime.onModuleDestroy();
  });
});
