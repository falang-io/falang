import { describe, expect, it } from 'vitest';
import { assertUnderDevPodLimit } from './dev-pod-limit.js';

const make = (running: { projectId: string; env: 'dev' | 'prod' }[], max: number) => ({
  runners: { listRunning: () => Promise.resolve(running) },
  projects: { list: () => Promise.resolve([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]) },
  limits: { getLimits: () => Promise.resolve({ maxDevPods: max }) },
});

describe('assertUnderDevPodLimit', () => {
  it('allows a start below the cap', async () => {
    await expect(
      assertUnderDevPodLimit(make([{ projectId: 'a', env: 'dev' }], 2), 'b', 'owner'),
    ).resolves.toBeUndefined();
  });

  it('refuses with 409 dev_pod_limit at the cap, ignoring prod pods and other owners', async () => {
    const running = [
      { projectId: 'a', env: 'dev' as const },
      { projectId: 'b', env: 'dev' as const },
      { projectId: 'c', env: 'prod' as const },
      { projectId: 'foreign', env: 'dev' as const },
    ];
    await expect(assertUnderDevPodLimit(make(running, 2), 'd', 'owner')).rejects.toMatchObject({
      status: 409,
      response: { code: 'dev_pod_limit' },
    });
  });

  it("does not count the project's own pod (a rebuild replaces it)", async () => {
    const running = [
      { projectId: 'a', env: 'dev' as const },
      { projectId: 'b', env: 'dev' as const },
    ];
    await expect(assertUnderDevPodLimit(make(running, 2), 'a', 'owner')).resolves.toBeUndefined();
  });
});
