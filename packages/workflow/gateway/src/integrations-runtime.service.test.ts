// oxlint-disable max-lines -- over the default cap because of the new "implicit targets for credential-less
// vendors" describe block (ADR 0037 (private) §4), not accumulated complexity.
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

const buildCredentialLessIntegration = (
  vendor: string,
  registerBackend: IWorkflowIntegration['registerBackend'],
): IWorkflowIntegration => ({
  vendor,
  label: vendor,
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  registerBackend,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('IntegrationsRuntimeService', () => {
  it('registers a webhook target for dev only (prod stays gated) once resumeProjectIntegrations activates dev', async () => {
    vi.useFakeTimers();
    const registerBackend = vi.fn().mockImplementation((ctx: IIntegrationBackendContext) => {
      ctx.registerWebHook('', () => Promise.resolve(new Response(null, { status: 200 })));
      return Promise.resolve(noopDispose);
    });
    const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
    const signalWorkflowWithStart = vi.fn();
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart,
      publicHost: 'https://bots.example.com',
    });

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).not.toHaveBeenCalled();

    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).toHaveBeenCalledTimes(1);

    expect(registerBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor: 'telegram',
        credentialId: 'cred-1',
        projectId: 'project-1',
        env: 'dev',
        webhookUrl: 'https://bots.example.com/webhooks/telegram/project-1/cred-1/dev',
        taskQueue: 'workflow-dev-project-1',
      }),
    );
    expect(runtime.findWebhookHandler('telegram', 'project-1', 'cred-1', 'dev', '')).toBeDefined();

    await runtime.onModuleDestroy();
  });

  it('does not share a webhook handler between two projects that use the same credential id', async () => {
    vi.useFakeTimers();
    const registerBackend = vi.fn().mockImplementation((ctx: IIntegrationBackendContext) => {
      ctx.registerWebHook('', () => Promise.resolve(new Response(String(ctx.projectId), { status: 200 })));
      return Promise.resolve(noopDispose);
    });
    const discovery = buildDiscovery({
      findCredentialInstances: vi
        .fn()
        .mockResolvedValue([singleInstance({ projectId: 'project-1' }), singleInstance({ projectId: 'project-2' })]),
    });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart: vi.fn(),
      publicHost: 'https://bots.example.com',
    });
    await runtime.onModuleInit();
    runtime.resumeProjectIntegrations('project-1', 'dev');
    runtime.resumeProjectIntegrations('project-2', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    const first = runtime.findWebhookHandler('telegram', 'project-1', 'cred-1', 'dev', '');
    const second = runtime.findWebhookHandler('telegram', 'project-2', 'cred-1', 'dev', '');
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
    const firstResponse = await first?.(new Request('http://x/'));
    const secondResponse = await second?.(new Request('http://x/'));
    await expect(firstResponse?.text()).resolves.toBe('project-1');
    await expect(secondResponse?.text()).resolves.toBe('project-2');
    expect(runtime.findWebhookHandler('telegram', 'project-3', 'cred-1', 'dev', '')).toBeUndefined();
    await runtime.onModuleDestroy();
  });

  it('gives ctx.webhookUrl as null and expects registerInterval when publicHost is unset', async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    const registerBackend = vi.fn().mockImplementation((ctx: IIntegrationBackendContext) => {
      expect(ctx.webhookUrl).toBeNull();
      ctx.registerInterval(() => {
        pollCount += 1;
        return Promise.resolve();
      }, 1000);
      return Promise.resolve(noopDispose);
    });
    const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart: vi.fn(),
    });

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).not.toHaveBeenCalled();

    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).toHaveBeenCalledTimes(1);
    expect(pollCount).toBe(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(pollCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pollCount).toBe(2);

    await runtime.onModuleDestroy();
  });

  it('does not activate a target until resolveCredentialFields stops returning undefined', async () => {
    vi.useFakeTimers();
    const registerBackend = vi.fn().mockResolvedValue(noopDispose);
    const resolveCredentialFields = vi
      .fn()
      // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- exercising the port's documented "not configured for this env yet" contract.
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ botToken: 'tok' });
    const discovery = buildDiscovery({
      findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]),
      resolveCredentialFields,
    });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart: vi.fn(),
    });

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).not.toHaveBeenCalled();

    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(registerBackend).toHaveBeenCalledTimes(1);

    await runtime.onModuleDestroy();
  });

  it('stops an active target on stopProjectIntegrations: clears its webhook route/interval and calls dispose()', async () => {
    vi.useFakeTimers();
    const dispose = vi.fn().mockResolvedValue(noopDispose());
    let intervalCalls = 0;
    const registerBackend = vi.fn().mockImplementation((ctx: IIntegrationBackendContext) => {
      ctx.registerWebHook('', () => Promise.resolve(new Response(null, { status: 200 })));
      ctx.registerInterval(() => {
        intervalCalls += 1;
        return Promise.resolve();
      }, 1000);
      return Promise.resolve(dispose);
    });
    const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart: vi.fn(),
    });

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.findWebhookHandler('telegram', 'project-1', 'cred-1', 'dev', '')).toBeUndefined();

    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.findWebhookHandler('telegram', 'project-1', 'cred-1', 'dev', '')).toBeDefined();

    runtime.stopProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(runtime.findWebhookHandler('telegram', 'project-1', 'cred-1', 'dev', '')).toBeUndefined();

    intervalCalls = 0;
    await vi.advanceTimersByTimeAsync(5000);
    expect(intervalCalls).toBe(0);

    await runtime.onModuleDestroy();
  });

  it('does not activate a newly discovered target for either env until resumeProjectIntegrations is called for its project', async () => {
    vi.useFakeTimers();
    const registerBackend = vi.fn().mockResolvedValue(noopDispose);
    const discovery = buildDiscovery({
      findCredentialInstances: vi.fn().mockResolvedValue([singleInstance({ instanceId: 'cred-1' })]),
    });
    const runtime = new IntegrationsRuntimeService({
      integrations: [buildIntegration(registerBackend)],
      discovery,
      signalWorkflowWithStart: vi.fn(),
    });

    await runtime.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).not.toHaveBeenCalled();

    runtime.resumeProjectIntegrations('project-1', 'dev');
    await vi.advanceTimersByTimeAsync(0);
    expect(registerBackend).toHaveBeenCalledTimes(1);
    expect(registerBackend).toHaveBeenCalledWith(expect.objectContaining({ env: 'dev' }));

    runtime.resumeProjectIntegrations('project-1', 'prod');
    await vi.advanceTimersByTimeAsync(0);

    expect(registerBackend).toHaveBeenCalledTimes(2);
    expect(registerBackend).toHaveBeenCalledWith(expect.objectContaining({ env: 'prod' }));

    await runtime.onModuleDestroy();
  });

  it("ctx.signalWorkflow forwards to signalWorkflowWithStart with this target's taskQueue", async () => {
    vi.useFakeTimers();
    const signalWorkflowWithStart = vi.fn().mockResolvedValue(noopDispose());
    const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
      await ctx.signalWorkflow({
        workflowId: 'wf-1',
        workflowType: 'onMessage',
        signalName: 'telegramMessage',
        signalArgs: [{ text: 'hi' }],
      });
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

    expect(signalWorkflowWithStart).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      workflowType: 'onMessage',
      signalName: 'telegramMessage',
      signalArgs: [{ text: 'hi' }],
      taskQueue: 'workflow-dev-project-1',
      projectId: 'project-1',
    });

    await runtime.onModuleDestroy();
  });

  describe('ctx.getInternalProjectToken', () => {
    it("forwards to the configured getInternalProjectToken with this target's projectId", async () => {
      vi.useFakeTimers();
      const getInternalProjectToken = vi.fn().mockReturnValue('tok-project-1');
      const registerBackend = vi.fn().mockResolvedValue(noopDispose);
      const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [buildIntegration(registerBackend)],
        discovery,
        signalWorkflowWithStart: vi.fn(),
        getInternalProjectToken,
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      const ctx = registerBackend.mock.calls[0]?.[0] as IIntegrationBackendContext;

      expect(ctx.getInternalProjectToken()).toBe('tok-project-1');
      expect(getInternalProjectToken).toHaveBeenCalledWith('project-1');

      await runtime.onModuleDestroy();
    });

    it('throws when called without a configured token source', async () => {
      vi.useFakeTimers();
      const registerBackend = vi.fn().mockResolvedValue(noopDispose);
      const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [buildIntegration(registerBackend)],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      const ctx = registerBackend.mock.calls[0]?.[0] as IIntegrationBackendContext;

      expect(() => ctx.getInternalProjectToken()).toThrow();

      await runtime.onModuleDestroy();
    });
  });

  // ADR 0037 (private) §4 — implicit targets for credential-less vendors.
  describe('implicit targets for credential-less vendors', () => {
    it('synthesizes an implicit target (credentialId === vendor) for a credential-less vendor with no explicit instance, gated by activatedProjects the same as an explicit target', async () => {
      vi.useFakeTimers();
      const registerBackend = vi.fn().mockResolvedValue(noopDispose);
      const integration = buildCredentialLessIntegration('schedule', registerBackend);
      const discovery = buildDiscovery({
        findCredentialInstances: vi.fn().mockResolvedValue([]),
        listProjectIds: vi.fn().mockResolvedValue(['project-1']),
      });
      const runtime = new IntegrationsRuntimeService({
        integrations: [integration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);
      expect(registerBackend).not.toHaveBeenCalled();

      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      expect(registerBackend).toHaveBeenCalledTimes(1);
      expect(registerBackend).toHaveBeenCalledWith(
        expect.objectContaining({
          vendor: 'schedule',
          credentialId: 'schedule',
          projectId: 'project-1',
          env: 'dev',
          fields: {},
        }),
      );

      runtime.resumeProjectIntegrations('project-1', 'prod');
      await vi.advanceTimersByTimeAsync(0);
      expect(registerBackend).toHaveBeenCalledTimes(2);
      expect(registerBackend).toHaveBeenCalledWith(
        expect.objectContaining({ vendor: 'schedule', credentialId: 'schedule', projectId: 'project-1', env: 'prod' }),
      );

      await runtime.onModuleDestroy();
    });

    it('does not synthesize an implicit target when the project already has an explicit instance of the vendor', async () => {
      vi.useFakeTimers();
      const registerBackend = vi.fn().mockResolvedValue(noopDispose);
      const integration = buildCredentialLessIntegration('schedule', registerBackend);
      const discovery = buildDiscovery({
        findCredentialInstances: vi
          .fn()
          .mockResolvedValue([singleInstance({ vendor: 'schedule', instanceId: 'sched-inst' })]),
        listProjectIds: vi.fn().mockResolvedValue(['project-1']),
      });
      const runtime = new IntegrationsRuntimeService({
        integrations: [integration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      expect(registerBackend).toHaveBeenCalledTimes(1);
      expect(registerBackend).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'sched-inst' }));

      await runtime.onModuleDestroy();
    });

    it("webhook's own pre-existing explicit empty instance keeps producing its own target — no second implicit target alongside it", async () => {
      vi.useFakeTimers();
      const registerBackend = vi.fn().mockResolvedValue(noopDispose);
      const integration = buildCredentialLessIntegration('webhook', registerBackend);
      const discovery = buildDiscovery({
        findCredentialInstances: vi
          .fn()
          .mockResolvedValue([singleInstance({ vendor: 'webhook', instanceId: 'webhook-1' })]),
        listProjectIds: vi.fn().mockResolvedValue(['project-1']),
      });
      const runtime = new IntegrationsRuntimeService({
        integrations: [integration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      expect(registerBackend).toHaveBeenCalledTimes(1);
      expect(registerBackend).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'webhook-1' }));

      await runtime.onModuleDestroy();
    });

    it('stops an active implicit target once an explicit instance of the same vendor appears, and resumes it once that instance is removed again', async () => {
      vi.useFakeTimers();
      const dispose = vi.fn().mockImplementation(noopDispose);
      const registerBackend = vi.fn().mockResolvedValue(dispose);
      const integration = buildCredentialLessIntegration('schedule', registerBackend);
      let instances: readonly IIntegrationCredentialInstance[] = [];
      const discovery = buildDiscovery({
        findCredentialInstances: vi.fn().mockImplementation(() => Promise.resolve(instances)),
        listProjectIds: vi.fn().mockResolvedValue(['project-1']),
      });
      const runtime = new IntegrationsRuntimeService({
        integrations: [integration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      expect(registerBackend).toHaveBeenCalledTimes(1);
      expect(registerBackend).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'schedule' }));

      // An explicit instance of the same vendor appears — the next discovery tick should stop the implicit target.
      instances = [singleInstance({ vendor: 'schedule', instanceId: 'sched-inst', projectId: 'project-1' })];
      await vi.advanceTimersByTimeAsync(30_000);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(registerBackend).toHaveBeenCalledTimes(2);
      expect(registerBackend).toHaveBeenLastCalledWith(expect.objectContaining({ credentialId: 'sched-inst' }));

      // The explicit instance is removed again — the implicit target should come back on a later tick.
      instances = [];
      await vi.advanceTimersByTimeAsync(30_000);
      expect(registerBackend).toHaveBeenCalledTimes(3);
      expect(registerBackend).toHaveBeenLastCalledWith(expect.objectContaining({ credentialId: 'schedule' }));

      await runtime.onModuleDestroy();
    });
  });

  describe('ctx schedule methods', () => {
    it('delegates upsertSchedule/pauseSchedule/deleteSchedule/listSchedules to the configured scheduleClient, scoped to this target', async () => {
      vi.useFakeTimers();
      const scheduleClient = {
        // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
        upsert: vi.fn().mockResolvedValue(undefined),
        // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
        pause: vi.fn().mockResolvedValue(undefined),
        // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        listAll: vi.fn().mockResolvedValue([]),
        listForProject: vi.fn().mockResolvedValue([]),
        deleteAllForProject: vi.fn().mockResolvedValue([]),
      };
      const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
        await ctx.upsertSchedule({
          scheduleId: 'sched-dev-doc-1',
          spec: { cronExpressions: ['0 9 * * 1-5'] },
          workflowType: 'onSchedule',
          workflowId: 'sched-doc-1',
          args: [{ scheduledAt: '2026-09-28T09:00:00.000Z', timezone: 'UTC' }],
        });
        await ctx.pauseSchedule('sched-dev-doc-1', 'stopped');
        await ctx.deleteSchedule('sched-dev-doc-1');
        await ctx.listSchedules();
        return noopDispose;
      });
      const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [buildIntegration(registerBackend)],
        discovery,
        signalWorkflowWithStart: vi.fn(),
        scheduleClient,
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      expect(scheduleClient.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 'sched-dev-doc-1',
          workflowType: 'onSchedule',
          workflowId: 'sched-doc-1',
          taskQueue: 'workflow-dev-project-1',
          projectId: 'project-1',
          env: 'dev',
        }),
      );
      expect(scheduleClient.pause).toHaveBeenCalledWith('project-1', 'sched-dev-doc-1', 'stopped');
      expect(scheduleClient.delete).toHaveBeenCalledWith('project-1', 'sched-dev-doc-1');
      expect(scheduleClient.list).toHaveBeenCalledWith('project-1', 'workflow-dev-project-1');

      await runtime.onModuleDestroy();
    });

    it('throws a descriptive error from every schedule method when no scheduleClient is configured', async () => {
      vi.useFakeTimers();
      const errors: unknown[] = [];
      const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
        try {
          await ctx.upsertSchedule({
            scheduleId: 'sched-dev-doc-1',
            spec: {},
            workflowType: 'onSchedule',
            workflowId: 'sched-doc-1',
            args: [],
          });
        } catch (error) {
          errors.push(error);
        }
        return noopDispose;
      });
      const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [buildIntegration(registerBackend)],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toMatch(/schedule client/i);

      await runtime.onModuleDestroy();
    });
  });

  describe('ctx.uploadFile', () => {
    it("delegates to the configured fileUpload port, scoped to this target's projectId", async () => {
      vi.useFakeTimers();
      const uploaded = { id: 'file-1', name: 'photo.jpg', size: 3, mime: 'image/jpeg' };
      const fileUpload = { upload: vi.fn().mockResolvedValue(uploaded) };
      const source = new Uint8Array([1, 2, 3]);
      const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
        const result = await ctx.uploadFile(source, {
          name: 'photo.jpg',
          mime: 'image/jpeg',
          createdBy: 'ingress:telegram',
        });
        expect(result).toEqual(uploaded);
        return noopDispose;
      });
      const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [buildIntegration(registerBackend)],
        discovery,
        signalWorkflowWithStart: vi.fn(),
        fileUpload,
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      expect(fileUpload.upload).toHaveBeenCalledWith('project-1', source, {
        name: 'photo.jpg',
        mime: 'image/jpeg',
        createdBy: 'ingress:telegram',
      });
      expect(registerBackend).toHaveBeenCalled();

      await runtime.onModuleDestroy();
    });

    it('throws a descriptive error when no fileUpload port is configured', async () => {
      vi.useFakeTimers();
      const errors: unknown[] = [];
      const registerBackend = vi.fn().mockImplementation(async (ctx: IIntegrationBackendContext) => {
        try {
          await ctx.uploadFile(new Uint8Array(), { name: 'x', mime: 'text/plain', createdBy: 'ingress:telegram' });
        } catch (error) {
          errors.push(error);
        }
        return noopDispose;
      });
      const discovery = buildDiscovery({ findCredentialInstances: vi.fn().mockResolvedValue([singleInstance()]) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [buildIntegration(registerBackend)],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toMatch(/file upload/i);

      await runtime.onModuleDestroy();
    });
  });

  describe('pauseProjectIntegrations', () => {
    it("calls onRunnerIdle only on the matching project/env's active targets, tolerating a bare dispose function elsewhere", async () => {
      vi.useFakeTimers();
      // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
      const onRunnerIdleDev = vi.fn().mockResolvedValue(undefined);
      const scheduleRegisterBackend = vi
        .fn()
        .mockResolvedValue({ dispose: noopDispose, onRunnerIdle: onRunnerIdleDev });
      const scheduleIntegration = buildCredentialLessIntegration('schedule', scheduleRegisterBackend);
      // A vendor with no `onRunnerIdle` at all (the bare-dispose-function shape every pre-existing vendor uses).
      const telegramRegisterBackend = vi.fn().mockResolvedValue(noopDispose);
      const telegramIntegration = buildIntegration(telegramRegisterBackend);
      const discovery = buildDiscovery({
        findCredentialInstances: vi.fn().mockResolvedValue([singleInstance({ vendor: 'telegram' })]),
        listProjectIds: vi.fn().mockResolvedValue(['project-1', 'project-2']),
      });
      const runtime = new IntegrationsRuntimeService({
        integrations: [scheduleIntegration, telegramIntegration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);
      expect(scheduleRegisterBackend).not.toHaveBeenCalled();

      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      runtime.resumeProjectIntegrations('project-2', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      await runtime.pauseProjectIntegrations('project-1', 'dev');

      expect(onRunnerIdleDev).toHaveBeenCalledTimes(1);
      // project-2's implicit `schedule` target is untouched by a project-1 pause.
      await runtime.pauseProjectIntegrations('project-2', 'prod');
      expect(onRunnerIdleDev).toHaveBeenCalledTimes(1);

      await runtime.onModuleDestroy();
    });

    it('logs, and does not throw, when a target onRunnerIdle rejects', async () => {
      vi.useFakeTimers();
      const onRunnerIdle = vi.fn().mockRejectedValue(new Error('pause failed'));
      const integration = buildCredentialLessIntegration(
        'schedule',
        vi.fn().mockResolvedValue({ dispose: noopDispose, onRunnerIdle }),
      );
      const discovery = buildDiscovery({ listProjectIds: vi.fn().mockResolvedValue(['project-1']) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [integration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      await expect(runtime.pauseProjectIntegrations('project-1', 'dev')).resolves.toBeUndefined();
      expect(onRunnerIdle).toHaveBeenCalledTimes(1);

      await runtime.onModuleDestroy();
    });
  });

  describe('resumeProjectIntegrations calling onRunnerResume', () => {
    it("calls onRunnerResume only on the matching project/env's already-active targets, not on one that's only just starting", async () => {
      vi.useFakeTimers();
      // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
      const onRunnerResumeDev = vi.fn().mockResolvedValue(undefined);
      const scheduleRegisterBackend = vi
        .fn()
        .mockResolvedValue({ dispose: noopDispose, onRunnerResume: onRunnerResumeDev });
      const scheduleIntegration = buildCredentialLessIntegration('schedule', scheduleRegisterBackend);
      const discovery = buildDiscovery({ listProjectIds: vi.fn().mockResolvedValue(['project-1', 'project-2']) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [scheduleIntegration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);

      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      runtime.resumeProjectIntegrations('project-2', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      // Neither target was "already active" the first time it was resumed — both were only just starting.
      expect(onRunnerResumeDev).not.toHaveBeenCalled();

      // Simulate a dev build restarting while project-1's target is already active (e.g. after a prior onRunnerIdle).
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);
      expect(onRunnerResumeDev).toHaveBeenCalledTimes(1);

      // project-2's already-active implicit `schedule` target is untouched by a project-1 resume.
      runtime.resumeProjectIntegrations('project-2', 'prod');
      await vi.advanceTimersByTimeAsync(0);
      expect(onRunnerResumeDev).toHaveBeenCalledTimes(1);

      await runtime.onModuleDestroy();
    });

    it('logs, and does not throw, when a target onRunnerResume rejects', async () => {
      vi.useFakeTimers();
      const onRunnerResume = vi.fn().mockRejectedValue(new Error('resume failed'));
      const integration = buildCredentialLessIntegration(
        'schedule',
        vi.fn().mockResolvedValue({ dispose: noopDispose, onRunnerResume }),
      );
      const discovery = buildDiscovery({ listProjectIds: vi.fn().mockResolvedValue(['project-1']) });
      const runtime = new IntegrationsRuntimeService({
        integrations: [integration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      // Already active this time — resumeAlreadyActiveTargets calls onRunnerResume, which rejects.
      expect(() => runtime.resumeProjectIntegrations('project-1', 'dev')).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
      expect(onRunnerResume).toHaveBeenCalledTimes(1);

      await runtime.onModuleDestroy();
    });

    it('tolerates a target whose handle has no onRunnerResume at all (the bare-dispose-function shape every pre-existing vendor uses)', async () => {
      vi.useFakeTimers();
      const telegramRegisterBackend = vi.fn().mockResolvedValue(noopDispose);
      const telegramIntegration = buildIntegration(telegramRegisterBackend);
      const discovery = buildDiscovery({
        findCredentialInstances: vi.fn().mockResolvedValue([singleInstance({ vendor: 'telegram' })]),
      });
      const runtime = new IntegrationsRuntimeService({
        integrations: [telegramIntegration],
        discovery,
        signalWorkflowWithStart: vi.fn(),
      });

      await runtime.onModuleInit();
      await vi.advanceTimersByTimeAsync(0);
      runtime.resumeProjectIntegrations('project-1', 'dev');
      await vi.advanceTimersByTimeAsync(0);

      // Calling it again while already active must not throw even though this vendor's handle has no onRunnerResume.
      expect(() => runtime.resumeProjectIntegrations('project-1', 'dev')).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);

      await runtime.onModuleDestroy();
    });
  });
});
