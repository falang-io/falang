import type { IIntegrationBackendContext, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IIntegrationsDiscoveryPort } from './discovery-port.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';

const discovery = (): IIntegrationsDiscoveryPort => ({
  findCredentialInstances: vi.fn().mockResolvedValue([{ instanceId: 'cred-1', vendor: 'telegram', projectId: 'p1' }]),
  resolveCredentialFields: vi.fn().mockResolvedValue({ botToken: 'tok' }),
  getDocumentsByType: vi.fn().mockResolvedValue([]),
  taskQueueFor: vi.fn((projectId: string, env: 'dev' | 'prod') =>
    env === 'dev' ? `workflow-dev-${projectId}` : `workflow-${projectId}`,
  ),
  listProjectIds: vi.fn().mockResolvedValue([]),
});

const integration = (registerBackend: IWorkflowIntegration['registerBackend']): IWorkflowIntegration => ({
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  registerBackend,
});

afterEach(() => {
  vi.useRealTimers();
});

const start = async (runtime: IntegrationsRuntimeService, env: 'dev' | 'prod' = 'dev'): Promise<void> => {
  await runtime.onModuleInit();
  await vi.advanceTimersByTimeAsync(0);
  runtime.resumeProjectIntegrations('p1', env);
  await vi.advanceTimersByTimeAsync(0);
};

describe('IntegrationsRuntimeService — run journal problems', () => {
  it('journals an undeliverable signal on the workflow id with no run, then rethrows to the vendor', async () => {
    vi.useFakeTimers();
    const recordProblem = vi.fn().mockResolvedValue(null);
    let thrown: unknown = null;
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      try {
        await ctx.signalWorkflow({
          workflowId: 'tg-doc-1',
          workflowType: 'onMessage',
          signalName: 'telegram-message',
          signalArgs: [{ text: 'hi' }],
        });
      } catch (error) {
        thrown = error;
      }
      return () => Promise.resolve();
    });
    const runtime = new IntegrationsRuntimeService({
      integrations: [integration(registerBackend)],
      discovery: discovery(),
      signalWorkflowWithStart: vi.fn().mockRejectedValue(new Error('temporal down')),
    });
    runtime.setEnsureRunnerRunning(() => Promise.reject(new Error('no pod')));
    runtime.setRunJournal({ recordProblem });
    await start(runtime);

    expect((thrown as Error).message).toBe('temporal down');
    expect(recordProblem).toHaveBeenCalledWith({
      projectId: 'p1',
      env: 'dev',
      vendor: 'telegram',
      workflowId: 'tg-doc-1',
      runId: null,
      level: 'warn',
      message: 'Undeliverable input: temporal down',
      data: {
        errorType: 'Error',
        signal: 'telegram-message',
        payload: { text: 'hi' },
        wakeError: 'no pod',
      },
    });
    await runtime.onModuleDestroy();
  });

  it('does not journal a delivered signal, and a throwing journal never changes the outcome', async () => {
    vi.useFakeTimers();
    const recordProblem = vi.fn().mockRejectedValue(new Error('journal broke'));
    const results: string[] = [];
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      await ctx.signalWorkflow({ workflowId: 'wf', workflowType: 't', signalName: 's', signalArgs: [] });
      results.push('delivered');
      await ctx.reportJournalProblem?.({ workflowId: 'wf', message: 'stale button' });
      results.push('reported');
      return () => Promise.resolve();
    });
    const runtime = new IntegrationsRuntimeService({
      integrations: [integration(registerBackend)],
      discovery: discovery(),
      signalWorkflowWithStart: vi.fn().mockResolvedValue(null),
    });
    runtime.setRunJournal({ recordProblem });
    await start(runtime, 'prod');

    expect(results).toEqual(['delivered', 'reported']);
    expect(recordProblem).toHaveBeenCalledTimes(1);
    expect(recordProblem).toHaveBeenCalledWith({
      workflowId: 'wf',
      message: 'stale button',
      projectId: 'p1',
      env: 'prod',
      vendor: 'telegram',
    });
    await runtime.onModuleDestroy();
  });

  it('ctx.reportJournalProblem is a no-op without a journal', async () => {
    vi.useFakeTimers();
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      await ctx.reportJournalProblem?.({ workflowId: 'wf', message: 'x' });
      return () => Promise.resolve();
    });
    const runtime = new IntegrationsRuntimeService({
      integrations: [integration(registerBackend)],
      discovery: discovery(),
      signalWorkflowWithStart: vi.fn().mockResolvedValue(null),
    });
    await start(runtime);
    expect(registerBackend).toHaveBeenCalled();
    await runtime.onModuleDestroy();
  });
});
