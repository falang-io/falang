import { runnerPods } from '../../metrics/metrics.js';
import type { RunnerProcessManager } from './runner-process-manager.js';

const DEFAULT_CACHE_MS = 20_000;

/**
 * Feeds `falang_runner_pods{env}` (ADR 0060 (private)). The count comes from `RunnerProcessManager.listRunning()`
 * (a k8s list), cached so a scrape every few seconds never turns into a k8s call each time; a failed
 * refresh keeps the last known values.
 */
export const registerRunnerPodsMetric = (
  manager: Pick<RunnerProcessManager, 'listRunning'>,
  cacheMs = DEFAULT_CACHE_MS,
  now: () => number = Date.now,
): void => {
  let refreshedAt = Number.NEGATIVE_INFINITY;
  runnerPods.onCollect(async (gauge) => {
    if (now() - refreshedAt < cacheMs) return;
    const running = await manager.listRunning();
    refreshedAt = now();
    const counts = { dev: 0, prod: 0 };
    for (const runner of running) counts[runner.env] += 1;
    gauge.set({ env: 'dev' }, counts.dev);
    gauge.set({ env: 'prod' }, counts.prod);
  });
};
