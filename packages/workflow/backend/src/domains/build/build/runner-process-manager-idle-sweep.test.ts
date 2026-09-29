import type { V1Deployment } from '@kubernetes/client-node';
import { describe, expect, it } from 'vitest';
import type { IK8sDeploymentsClient } from './k8s-deployments-client.js';
import { RunnerProcessManager } from './runner-process-manager.js';

const NAMESPACE = 'workflow';

const createFakeDeploymentsClient = (): IK8sDeploymentsClient & { readonly deployments: Map<string, V1Deployment> } => {
  const deployments = new Map<string, V1Deployment>();
  return {
    deployments,
    apply(_namespace, deployment) {
      const name = deployment.metadata?.name;
      if (!name) throw new Error('missing name');
      deployments.set(name, deployment);
      return Promise.resolve();
    },
    delete(_namespace, name) {
      deployments.delete(name);
      return Promise.resolve();
    },
    exists(_namespace, name) {
      return Promise.resolve(deployments.has(name));
    },
    listNames(_namespace, labelSelector) {
      const [key, value] = labelSelector.split('=');
      return Promise.resolve(
        [...deployments.values()]
          .filter((deployment) => deployment.metadata?.labels?.[key as string] === value)
          .map((deployment) => deployment.metadata?.name)
          // oxlint-disable-next-line unicorn/prefer-native-coercion-functions -- the type predicate (not just truthiness) is what narrows this to `string[]`; bare `Boolean` doesn't.
          .filter((name): name is string => Boolean(name)),
      );
    },
    listAll(_namespace, labelSelector) {
      const [key, value] = labelSelector.split('=');
      return Promise.resolve(
        [...deployments.values()]
          .filter((deployment) => deployment.metadata?.labels?.[key as string] === value)
          .map((deployment) => ({ name: deployment.metadata?.name ?? '', labels: deployment.metadata?.labels ?? {} }))
          .filter((item) => item.name !== ''),
      );
    },
  };
};

const createManager = (): { manager: RunnerProcessManager; client: ReturnType<typeof createFakeDeploymentsClient> } => {
  const client = createFakeDeploymentsClient();
  const manager = new RunnerProcessManager({ deploymentsClient: client, k8sNamespace: NAMESPACE, runnerImage: 'falang/workflow-runner:test' });
  return { manager, client };
};

describe('RunnerProcessManager — listRunning()', () => {
  it('reports taskQueue/projectId/env for the unversioned dev deployment, with no buildId', async () => {
    const { manager } = createManager();
    await manager.start({ taskQueue: 'workflow-dev-1', projectId: 'project-1', internalProjectToken: 't', workflowEnv: 'dev' });

    const running = await manager.listRunning();
    expect(running).toEqual([{ deploymentName: 'workflow-dev-1', taskQueue: 'workflow-dev-1', projectId: 'project-1', env: 'dev' }]);
  });

  it('reports buildId for a versioned prod deployment', async () => {
    const { manager } = createManager();
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });

    const running = await manager.listRunning();
    expect(running).toEqual([{ deploymentName: 'workflow-1-v1', taskQueue: 'workflow-1', buildId: 'v1', projectId: 'p', env: 'prod' }]);
  });
});

describe('RunnerProcessManager — stopIdleRunners()', () => {
  it('does not stop a deployment touched more recently than idleTimeoutMs', async () => {
    const { manager, client } = createManager();
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    const stopped = await manager.stopIdleRunners(30_000, Date.now() + 10_000);
    expect(stopped).toEqual([]);
    expect(client.deployments.has('workflow-1')).toBe(true);
  });

  it('stops a deployment idle for at least idleTimeoutMs since its own start()', async () => {
    const { manager, client } = createManager();
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    const stopped = await manager.stopIdleRunners(30_000, Date.now() + 60_000);
    expect(stopped).toEqual(['workflow-1']);
    expect(client.deployments.has('workflow-1')).toBe(false);
  });

  it('treats a taskQueue-level touch() (manual run / trigger signal) as activity for its currently-running version', async () => {
    const { manager, client } = createManager();
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });

    // e.g. BuildService.run()/ensureRunnerRunning, which only knows the taskQueue.
    manager.touch('workflow-1');

    const stopped = await manager.stopIdleRunners(30_000, Date.now() + 20_000);
    expect(stopped).toEqual([]);
    expect(client.deployments.has('workflow-1-v1')).toBe(true);
  });

  it('gives a never-touched deployment (e.g. surviving a backend restart) a fresh baseline instead of stopping it immediately', async () => {
    const { client, manager: seedManager } = createManager();
    // Simulate a deployment created by a previous manager instance (no touch() recorded here).
    await seedManager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });
    const freshManager = new RunnerProcessManager({ deploymentsClient: client, k8sNamespace: NAMESPACE, runnerImage: 'x' });

    const firstSweep = await freshManager.stopIdleRunners(30_000);
    expect(firstSweep).toEqual([]);
    expect(client.deployments.has('workflow-1')).toBe(true);

    const secondSweep = await freshManager.stopIdleRunners(30_000, Date.now() + 60_000);
    expect(secondSweep).toEqual(['workflow-1']);
  });
});
