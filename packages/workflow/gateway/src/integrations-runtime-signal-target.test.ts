import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IIntegrationsDiscoveryPort } from './discovery-port.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';
import type { TSignalWorkflowWithStart } from './signal-workflow.js';
import { RunnerStartRefusedError } from './runner-start-refused-error.js';

const signal = {
  workflowId: 'table-doc-1',
  workflowType: 'onRecord',
  signalName: 'tableRecordCreated',
  signalArgs: [{}],
};

const discovery: IIntegrationsDiscoveryPort = {
  findCredentialInstances: vi.fn().mockResolvedValue([]),
  resolveCredentialFields: vi.fn().mockResolvedValue({}),
  getDocumentsByType: vi.fn().mockResolvedValue([]),
  taskQueueFor: (projectId: string, env: 'dev' | 'prod') => `${env}-${projectId}`,
  listProjectIds: vi.fn().mockResolvedValue(['project-1']),
};

const tablesLike: IWorkflowIntegration = {
  vendor: 'tables',
  label: 'Tables',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  registerBackend: () => Promise.resolve(() => Promise.resolve()),
};

afterEach(() => {
  vi.useRealTimers();
});

const start = async (
  signalWorkflowWithStart: TSignalWorkflowWithStart,
  ensureRunnerRunning?: Parameters<IntegrationsRuntimeService['setEnsureRunnerRunning']>[0],
): Promise<IntegrationsRuntimeService> => {
  vi.useFakeTimers();
  const runtime = new IntegrationsRuntimeService({
    integrations: [tablesLike],
    discovery,
    signalWorkflowWithStart,
  });
  if (ensureRunnerRunning) runtime.setEnsureRunnerRunning(ensureRunnerRunning);
  await runtime.onModuleInit();
  await vi.advanceTimersByTimeAsync(0);
  return runtime;
};

describe('IntegrationsRuntimeService.signalTarget', () => {
  it('is inactive while the environment is not activated', async () => {
    const signalWorkflowWithStart = vi.fn<TSignalWorkflowWithStart>().mockResolvedValue();
    const runtime = await start(signalWorkflowWithStart);
    await expect(runtime.signalTarget('tables', 'project-1', 'dev', signal)).resolves.toBe('inactive');
    expect(signalWorkflowWithStart).not.toHaveBeenCalled();
    await runtime.onModuleDestroy();
  });

  it('wakes the runner and signals with the target task queue once activated', async () => {
    const signalWorkflowWithStart = vi.fn<TSignalWorkflowWithStart>().mockResolvedValue();
    const ensureRunnerRunning = vi.fn<() => Promise<void>>().mockResolvedValue();
    const runtime = await start(signalWorkflowWithStart, ensureRunnerRunning);
    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    await expect(runtime.signalTarget('tables', 'project-1', 'dev', signal)).resolves.toBe('delivered');
    expect(ensureRunnerRunning).toHaveBeenCalledWith({
      projectId: 'project-1',
      env: 'dev',
      taskQueue: 'dev-project-1',
    });
    expect(signalWorkflowWithStart).toHaveBeenCalledWith({
      ...signal,
      taskQueue: 'dev-project-1',
      projectId: 'project-1',
    });
    await expect(runtime.signalTarget('tables', 'project-1', 'prod', signal)).resolves.toBe('inactive');
    await runtime.onModuleDestroy();
  });

  it('rethrows a refused start without signalling', async () => {
    const signalWorkflowWithStart = vi.fn<TSignalWorkflowWithStart>().mockResolvedValue();
    const ensureRunnerRunning = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new RunnerStartRefusedError('suspended'));
    const runtime = await start(signalWorkflowWithStart, ensureRunnerRunning);
    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    await expect(runtime.signalTarget('tables', 'project-1', 'dev', signal)).rejects.toBeInstanceOf(
      RunnerStartRefusedError,
    );
    expect(signalWorkflowWithStart).not.toHaveBeenCalled();
    await runtime.onModuleDestroy();
  });
});
