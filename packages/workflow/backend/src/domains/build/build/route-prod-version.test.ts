import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { startAndRouteProdVersion, type IRouteProdVersionDeps } from './route-prod-version.js';

const makeDeps = (params: { running: boolean; route: () => Promise<void> }) => {
  const deps = {
    runnerProcessManager: {
      isRunning: vi.fn(() => Promise.resolve(params.running)),
      stopVersion: vi.fn(() => Promise.resolve()),
    },
    deploymentCli: { setCurrentVersionWithRetry: vi.fn(params.route) },
    startRunner: vi.fn(() => Promise.resolve()),
  };
  return deps satisfies IRouteProdVersionDeps;
};

describe('startAndRouteProdVersion', () => {
  it('starts a stopped version and routes new starts to it', async () => {
    const deps = makeDeps({ running: false, route: () => Promise.resolve() });

    await startAndRouteProdVersion(deps, 'p1', 'workflow-p1', 'v2');

    expect(deps.startRunner).toHaveBeenCalledWith('v2');
    expect(deps.deploymentCli.setCurrentVersionWithRetry).toHaveBeenCalledWith('p1', 'workflow-p1', 'v2');
    expect(deps.runnerProcessManager.stopVersion).not.toHaveBeenCalled();
  });

  it('removes the pod it just started when routing fails, so prod is not reported as running', async () => {
    const deps = makeDeps({ running: false, route: () => Promise.reject(new Error('no Worker Deployment found')) });

    const result = startAndRouteProdVersion(deps, 'p1', 'workflow-p1', 'v2');

    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(result).rejects.toThrow('no Worker Deployment found');
    expect(deps.runnerProcessManager.stopVersion).toHaveBeenCalledWith('workflow-p1', 'v2');
  });

  it('leaves an already-running pod alone when routing fails', async () => {
    const deps = makeDeps({ running: true, route: () => Promise.reject(new Error('temporal down')) });

    await expect(startAndRouteProdVersion(deps, 'p1', 'workflow-p1', 'v2')).rejects.toThrow('temporal down');

    expect(deps.startRunner).not.toHaveBeenCalled();
    expect(deps.runnerProcessManager.stopVersion).not.toHaveBeenCalled();
  });
});
