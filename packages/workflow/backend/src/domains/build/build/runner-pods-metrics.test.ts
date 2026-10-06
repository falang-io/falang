import { describe, expect, it, vi } from 'vitest';
import { metricsRegistry } from '../../metrics/metrics-registry.js';
import { registerRunnerPodsMetric } from './runner-pods-metrics.js';

describe('registerRunnerPodsMetric', () => {
  it('counts runners per env and caches the k8s listing between scrapes', async () => {
    const listRunning = vi.fn().mockResolvedValue([{ env: 'dev' }, { env: 'prod' }, { env: 'prod' }]);
    let clock = 1000;
    registerRunnerPodsMetric({ listRunning }, 20_000, () => clock);
    const first = await metricsRegistry.render();
    expect(first).toContain('falang_runner_pods{env="dev"} 1');
    expect(first).toContain('falang_runner_pods{env="prod"} 2');
    clock += 5000;
    await metricsRegistry.render();
    expect(listRunning).toHaveBeenCalledTimes(1);
    clock += 20_000;
    await metricsRegistry.render();
    expect(listRunning).toHaveBeenCalledTimes(2);
  });
});
