import { getEgressVendor } from '@falang/workflow-egress';
import type { IIntegrationBackendContext, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import type { IIntegrationsDiscoveryPort } from './discovery-port.js';
import { IntegrationsRuntimeService } from './integrations-runtime.service.js';

/** ADR 0056 (private): vendor code runs inside `runWithEgressVendor(target.vendor)`. */
describe('IntegrationsRuntimeService egress vendor context', () => {
  it('wraps registerBackend, its timers, webhook handlers and the handle hooks', async () => {
    const seen: Record<string, string | undefined> = {};
    const integration: IWorkflowIntegration = {
      vendor: 'telegram',
      label: 'Telegram',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [],
      registerBackend: (ctx: IIntegrationBackendContext) => {
        seen.register = getEgressVendor();
        setTimeout(() => {
          seen.timer = getEgressVendor();
        }, 10);
        ctx.registerWebHook('', () => {
          seen.webhook = getEgressVendor();
          return Promise.resolve(new Response(null, { status: 200 }));
        });
        ctx.registerInterval(() => {
          seen.interval = getEgressVendor();
          return Promise.resolve();
        }, 100);
        return Promise.resolve({
          dispose: () => {
            seen.dispose = getEgressVendor();
            return Promise.resolve();
          },
          onRunnerIdle: () => {
            seen.idle = getEgressVendor();
            return Promise.resolve();
          },
          onRunnerResume: () => {
            seen.resume = getEgressVendor();
            return Promise.resolve();
          },
        });
      },
    };
    const discovery: IIntegrationsDiscoveryPort = {
      findCredentialInstances: vi
        .fn()
        .mockResolvedValue([{ instanceId: 'cred-1', vendor: 'telegram', projectId: 'p1' }]),
      resolveCredentialFields: vi.fn().mockResolvedValue({}),
      getDocumentsByType: vi.fn().mockResolvedValue([]),
      taskQueueFor: vi.fn(() => 'q'),
      listProjectIds: vi.fn().mockResolvedValue([]),
    };
    const runtime = new IntegrationsRuntimeService({
      integrations: [integration],
      discovery,
      signalWorkflowWithStart: vi.fn(),
    });

    await runtime.onModuleInit();
    runtime.resumeProjectIntegrations('p1', 'dev');
    // Real timers: fake timers don't carry AsyncLocalStorage context.
    await vi.waitFor(() => expect(seen.interval && seen.timer).toBeTruthy(), { timeout: 3000 });
    expect(getEgressVendor()).toBeUndefined();

    await runtime.findWebhookHandler(
      'telegram',
      'cred-1',
      'dev',
      '',
    )?.(new Request('http://x.invalid/', { method: 'POST' }));
    await runtime.pauseProjectIntegrations('p1', 'dev');
    runtime.resumeProjectIntegrations('p1', 'dev');
    await vi.waitFor(() => expect(seen.resume).toBe('telegram'));
    await runtime.onModuleDestroy();

    expect(seen).toEqual({
      register: 'telegram',
      timer: 'telegram',
      webhook: 'telegram',
      interval: 'telegram',
      idle: 'telegram',
      resume: 'telegram',
      dispose: 'telegram',
    });
  });
});
