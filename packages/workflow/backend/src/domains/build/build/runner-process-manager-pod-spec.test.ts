// oxlint-disable init-declarations, unicorn/no-await-expression-member -- small test helper capturing the applied Deployment.
import type { V1Deployment } from '@kubernetes/client-node';
import { describe, expect, it } from 'vitest';
import type { IK8sDeploymentsClient } from './k8s-deployments-client.js';
import { RunnerProcessManager, type IRunnerProcessManagerParams } from './runner-process-manager.js';

const startAndGet = async (overrides: Partial<IRunnerProcessManagerParams> = {}): Promise<V1Deployment> => {
  let applied: V1Deployment | undefined;
  const client = {
    apply: (_ns: string, deployment: V1Deployment) => {
      applied = deployment;
      return Promise.resolve();
    },
    delete: () => Promise.resolve(),
    exists: () => Promise.resolve(false),
    listNames: () => Promise.resolve([]),
    listAll: () => Promise.resolve([]),
  } as unknown as IK8sDeploymentsClient;
  const manager = new RunnerProcessManager({
    deploymentsClient: client,
    k8sNamespace: 'workflow',
    runnerImage: 'runner:test',
    ...overrides,
  });
  await manager.start({ taskQueue: 'q', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });
  if (!applied) throw new Error('no deployment applied');
  return applied;
};

describe('runner pod spec — storage bounds and placement (P1-3)', () => {
  it('bounds ephemeral-storage and the /tmp emptyDir by default and sets no placement', async () => {
    const spec = (await startAndGet()).spec?.template?.spec;
    const resources = spec?.containers?.[0]?.resources;
    expect(resources?.requests?.['ephemeral-storage']).toBe('256Mi');
    expect(resources?.limits?.['ephemeral-storage']).toBe('1Gi');
    expect(spec?.volumes).toEqual([{ name: 'tmp', emptyDir: { sizeLimit: '512Mi' } }]);
    expect(spec?.nodeSelector).toBeUndefined();
    expect(spec?.tolerations).toBeUndefined();
  });

  it('takes sizes, nodeSelector and tolerations from the params', async () => {
    const spec = (
      await startAndGet({
        ephemeralStorageLimit: '2Gi',
        ephemeralStorageRequest: '512Mi',
        tmpSizeLimit: '1Gi',
        nodeSelector: { 'falang.dev/node-role': 'runners' },
        tolerations: [{ key: 'falang.dev/node-role', operator: 'Equal', value: 'runners', effect: 'NoSchedule' }],
      })
    ).spec?.template?.spec;
    expect(spec?.containers?.[0]?.resources?.limits?.['ephemeral-storage']).toBe('2Gi');
    expect(spec?.containers?.[0]?.resources?.requests?.['ephemeral-storage']).toBe('512Mi');
    expect(spec?.volumes?.[0]?.emptyDir?.sizeLimit).toBe('1Gi');
    expect(spec?.nodeSelector).toEqual({ 'falang.dev/node-role': 'runners' });
    expect(spec?.tolerations).toHaveLength(1);
  });
});
