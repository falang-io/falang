import type { IIntegrationBackendContext, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IIntegrationCredentialInstance, IIntegrationsDiscoveryPort } from './discovery-port.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';

const noopDispose = (): Promise<void> => Promise.resolve();

const buildDiscovery = (overrides: Partial<IIntegrationsDiscoveryPort> = {}): IIntegrationsDiscoveryPort => ({
  findCredentialInstances: vi.fn().mockResolvedValue([]),
  resolveCredentialFields: vi.fn().mockResolvedValue({ botToken: 'tok' }),
  getDocumentsByType: vi.fn().mockResolvedValue([]),
  taskQueueFor: vi.fn((projectId: string, env: 'dev' | 'prod') =>
    env === 'dev' ? `workflow-dev-${projectId}` : `workflow-${projectId}`,
  ),
  listProjectIds: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const singleInstance = (overrides: Partial<IIntegrationCredentialInstance> = {}): IIntegrationCredentialInstance => ({
  instanceId: 'cred-1',
  vendor: 'telegram',
  projectId: 'project-1',
  ...overrides,
});

const buildIntegration = (registerBackend: IWorkflowIntegration['registerBackend']): IWorkflowIntegration => ({
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  registerBackend,
});

const signalOnce = (ctx: IIntegrationBackendContext): Promise<void> =>
  ctx.signalWorkflow({ workflowId: 'wf-1', workflowType: 'onMessage', signalName: 's', signalArgs: [] });

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsRuntimeService — setEnsureRunnerRunning', () => {
  it('calls ensureRunnerRunning with projectId/env/taskQueue before forwarding the signal', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const ensureRunnerRunning = vi.fn().mockImplementation(() => {
      calls.push('ensure');
      return Promise.resolve();
    });
    const signalWorkflowWithStart = vi.fn().mockImplementation(() => {
      calls.push('signal');
      return Promise.resolve();
    });
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      await signalOnce(ctx);
      return noopDispose;
    });
    const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart,
    });
    runtime.setEnsureRunnerRunning(ensureRunnerRunning);

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    expect(ensureRunnerRunning).toHaveBeenCalledWith({
      projectId: 'project-1',
      env: 'dev',
      taskQueue: 'workflow-dev-project-1',
    });
    // Wakes the pod before signaling, not after.
    expect(calls).toEqual(['ensure', 'signal']);

    await runtime.onModuleDestroy();
  });

  it('still forwards the signal if ensureRunnerRunning throws (best-effort, no worse than not having it)', async () => {
    vi.useFakeTimers();
    const signalWorkflowWithStart = vi.fn().mockImplementation(() => Promise.resolve());
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      await signalOnce(ctx);
      return noopDispose;
    });
    const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart,
    });
    runtime.setEnsureRunnerRunning(() => Promise.reject(new Error('wake failed')));

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    expect(signalWorkflowWithStart).toHaveBeenCalledTimes(1);

    await runtime.onModuleDestroy();
  });

  it('never calls signalWorkflowWithStart before ensureRunnerRunning resolves', async () => {
    vi.useFakeTimers();
    let ensureResolved = false;
    const signalWorkflowWithStart = vi.fn().mockImplementation(() => {
      expect(ensureResolved).toBe(true);
      return Promise.resolve();
    });
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      await signalOnce(ctx);
      return noopDispose;
    });
    const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart,
    });
    runtime.setEnsureRunnerRunning(async () => {
      await Promise.resolve();
      ensureResolved = true;
    });

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    expect(signalWorkflowWithStart).toHaveBeenCalledTimes(1);

    await runtime.onModuleDestroy();
  });

  it('degrades to unconditional signaling when no ensureRunnerRunning hook is set', async () => {
    vi.useFakeTimers();
    const signalWorkflowWithStart = vi.fn().mockImplementation(() => Promise.resolve());
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      await signalOnce(ctx);
      return noopDispose;
    });
    const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart,
    });

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    expect(signalWorkflowWithStart).toHaveBeenCalledTimes(1);

    await runtime.onModuleDestroy();
  });
});
