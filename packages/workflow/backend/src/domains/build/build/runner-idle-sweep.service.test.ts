import type { IntegrationsRuntimeService } from '@falang/workflow-gateway';
import { describe, expect, it, vi } from 'vitest';
import { RunnerIdleSweepService } from './runner-idle-sweep.service.js';
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
