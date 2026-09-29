import { describe, expect, it, vi } from 'vitest';
import { ensureRunnerRunning, type IEnsureRunnerRunningDeps } from './ensure-runner-running.js';

interface IFakeDepsOptions {
  readonly isRunning?: boolean;
  readonly hasDevArtifact?: boolean;
}

const buildFakeDeps = (
  options: IFakeDepsOptions = {},
): { readonly deps: IEnsureRunnerRunningDeps; readonly touch: ReturnType<typeof vi.fn>; readonly start: ReturnType<typeof vi.fn> } => {
  const touch = vi.fn();
  const start = vi.fn().mockResolvedValue(null);
  const runnerProcessManager = {
    touch,
    start,
    isRunning: vi.fn().mockResolvedValue(options.isRunning ?? false),
    isAnyRunning: vi.fn().mockResolvedValue(options.isRunning ?? false),
  } as unknown as IEnsureRunnerRunningDeps['runnerProcessManager'];

  const deps: IEnsureRunnerRunningDeps = {
    runnerProcessManager,
    devArtifacts: { has: vi.fn().mockReturnValue(options.hasDevArtifact ?? true) } as unknown as IEnsureRunnerRunningDeps['devArtifacts'],
    projectTokens: { getOrCreateToken: vi.fn().mockReturnValue('token') } as unknown as IEnsureRunnerRunningDeps['projectTokens'],
    versions: { findOne: vi.fn().mockResolvedValue(null) } as unknown as IEnsureRunnerRunningDeps['versions'],
    deploymentCli: { setCurrentVersionWithRetry: vi.fn() } as unknown as IEnsureRunnerRunningDeps['deploymentCli'],
    startVersionRunnerIfNeeded: vi.fn().mockResolvedValue(null),
  };
  return { deps, touch, start };
};

describe('ensureRunnerRunning — options.touch', () => {
  it('touches the task queue by default, even when the pod is already running', async () => {
    const { deps, touch } = buildFakeDeps({ isRunning: true });
    await ensureRunnerRunning(deps, 'p1', 'dev', 'workflow-dev-p1');
    expect(touch).toHaveBeenCalledWith('workflow-dev-p1');
  });

  it('does not touch when touch: false and the dev pod is already running', async () => {
    const { deps, touch, start } = buildFakeDeps({ isRunning: true });
    await ensureRunnerRunning(deps, 'p1', 'dev', 'workflow-dev-p1', { touch: false });
    expect(touch).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('still cold-starts a stopped dev pod when touch: false, if a dev artifact exists', async () => {
    const { deps, touch, start } = buildFakeDeps({ isRunning: false, hasDevArtifact: true });
    await ensureRunnerRunning(deps, 'p1', 'dev', 'workflow-dev-p1', { touch: false });
    expect(touch).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not start a dev pod with no dev artifact, regardless of touch', async () => {
    const { deps, start } = buildFakeDeps({ isRunning: false, hasDevArtifact: false });
    await ensureRunnerRunning(deps, 'p1', 'dev', 'workflow-dev-p1', { touch: false });
    expect(start).not.toHaveBeenCalled();
  });

  it('touches a prod task queue by default (options omitted)', async () => {
    const { deps, touch } = buildFakeDeps({ isRunning: true });
    await ensureRunnerRunning(deps, 'p1', 'prod', 'workflow-p1');
    expect(touch).toHaveBeenCalledWith('workflow-p1');
  });
});
