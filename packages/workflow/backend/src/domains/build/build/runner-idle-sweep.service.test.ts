// oxlint-disable no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/catch-error-name, oxc/no-map-spread -- test fakes: resolving/rejecting with nothing, small local helpers and one-off spreads read better than the lint-preferred shapes.
import type { IntegrationsRuntimeService } from '@falang/workflow-gateway';
import { describe, expect, it, vi } from 'vitest';
import { RunnerIdleSweepService } from './runner-idle-sweep.service.js';
import type { ProjectRuntimeSettingsService } from '../../projects/runtime-settings/project-runtime-settings.service.js';
import type { RunnerSessionsService } from '../runner-sessions/runner-sessions.service.js';
import type { RunnerProcessManager } from './runner-process-manager.js';

const buildService = (
  stopped: readonly string[],
  pauseProjectIntegrations: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null),
): { readonly service: RunnerIdleSweepService; readonly pauseProjectIntegrations: ReturnType<typeof vi.fn> } => {
  const runnerProcessManager = {
    stopIdleRunners: vi.fn().mockResolvedValue(stopped),
  } as unknown as RunnerProcessManager;
  const integrationsRuntime = { pauseProjectIntegrations } as unknown as IntegrationsRuntimeService;

  const service = new RunnerIdleSweepService(runnerProcessManager, 30 * 60 * 1000, integrationsRuntime);
  return { service, pauseProjectIntegrations };
};

// `sweep` is private — reached through `onModuleInit`'s own timer would need fake timers just to
// invoke it once; calling the private method directly (cast through `any`) is simpler and matches
// this file's own narrow scope (ADR 0037 (private) §6).
const runSweep = (service: RunnerIdleSweepService): Promise<void> =>
  (service as unknown as { sweep: () => Promise<void> }).sweep();

describe('RunnerIdleSweepService — dev schedule auto-pause forwarding (0037 §6)', () => {
  it('pauses dev integrations for a stopped dev deployment', async () => {
    const { service, pauseProjectIntegrations } = buildService(['workflow-dev-project-1']);
    await runSweep(service);
    expect(pauseProjectIntegrations).toHaveBeenCalledWith('project-1', 'dev');
  });

  it('does not touch integrations for a stopped prod deployment', async () => {
    const { service, pauseProjectIntegrations } = buildService(['workflow-project-1-v1']);
    await runSweep(service);
    expect(pauseProjectIntegrations).not.toHaveBeenCalled();
  });

  it('does nothing when nothing was stopped', async () => {
    const { service, pauseProjectIntegrations } = buildService([]);
    await runSweep(service);
    expect(pauseProjectIntegrations).not.toHaveBeenCalled();
  });

  it('pauses every stopped dev deployment, ignoring stopped prod ones in the same sweep', async () => {
    const { service, pauseProjectIntegrations } = buildService(['workflow-dev-project-1', 'workflow-project-2-v3', 'workflow-dev-project-3']);
    await runSweep(service);
    expect(pauseProjectIntegrations).toHaveBeenCalledTimes(2);
    expect(pauseProjectIntegrations).toHaveBeenCalledWith('project-1', 'dev');
    expect(pauseProjectIntegrations).toHaveBeenCalledWith('project-3', 'dev');
  });

  it('logs but does not throw when pauseProjectIntegrations rejects', async () => {
    const { service } = buildService(['workflow-dev-project-1'], vi.fn().mockRejectedValue(new Error('boom')));
    await expect(runSweep(service)).resolves.toBeUndefined();
  });
});

describe('RunnerIdleSweepService — per-project policy and session reconcile (ADR 0067)', () => {
  const build = () => {
    const running = [
      { deploymentName: 'workflow-dev-a', taskQueue: 'workflow-dev-a', projectId: 'a', env: 'dev' as const },
      { deploymentName: 'workflow-b-v1', taskQueue: 'workflow-b', buildId: 'v1', projectId: 'b', env: 'prod' as const },
    ];
    const stopIdleRunners = vi.fn().mockResolvedValue([]);
    const listRunning = vi.fn().mockResolvedValue(running);
    const runnerProcessManager = { stopIdleRunners, listRunning } as unknown as RunnerProcessManager;
    const resolveIdlePolicies = vi.fn().mockResolvedValue(
      new Map([
        ['a', { dev: 60_000, prod: 120_000 }],
        ['b', { dev: 60_000, prod: null }],
      ]),
    );
    const settings = {
      resolveIdlePolicies,
      defaultPolicy: { dev: 1_800_000, prod: 1_800_000 },
    } as unknown as ProjectRuntimeSettingsService;
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const sessions = { reconcile } as unknown as RunnerSessionsService;
    const integrationsRuntime = { pauseProjectIntegrations: vi.fn() } as unknown as IntegrationsRuntimeService;
    const service = new RunnerIdleSweepService(runnerProcessManager, 1, integrationsRuntime, settings, sessions);
    return { service, stopIdleRunners, running, resolveIdlePolicies, reconcile, listRunning };
  };

  it('hands stopIdleRunners a resolver built from each project and env policy (null = always on)', async () => {
    const { service, stopIdleRunners, running, resolveIdlePolicies } = build();
    await runSweep(service);
    expect(resolveIdlePolicies).toHaveBeenCalledWith(['a', 'b']);
    const [resolver, , passedRunning] = stopIdleRunners.mock.calls[0] as [(runner: (typeof running)[number]) => number | null, number, unknown];
    expect(passedRunning).toBe(running);
    expect(resolver(running[0] as (typeof running)[number])).toBe(60_000);
    expect(resolver(running[1] as (typeof running)[number])).toBeNull();
    expect(resolver({ ...(running[0] as (typeof running)[number]), projectId: 'unknown' })).toBe(1_800_000);
  });

  it('reconciles the sessions against the deployments listed after the stops', async () => {
    const { service, reconcile, running } = build();
    await runSweep(service);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile.mock.calls[0]?.[0]).toBe(running);
  });

  it('a failing reconcile is logged, not thrown', async () => {
    const { service, reconcile } = build();
    reconcile.mockRejectedValue(new Error('db down'));
    await expect(runSweep(service)).resolves.toBeUndefined();
  });
});
