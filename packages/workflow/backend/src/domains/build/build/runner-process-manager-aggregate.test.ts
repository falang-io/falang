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

describe('RunnerProcessManager — aggregate task-queue operations', () => {
  it('isAnyRunning() reflects whether any version is running on the task queue', async () => {
    const client = createFakeDeploymentsClient();
    const manager = new RunnerProcessManager({ deploymentsClient: client, k8sNamespace: NAMESPACE, runnerImage: 'img' });

    expect(await manager.isAnyRunning('workflow-1')).toBe(false);

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });

    expect(await manager.isAnyRunning('workflow-1')).toBe(true);

    await manager.stopVersion('workflow-1', 'v1');

    expect(await manager.isAnyRunning('workflow-1')).toBe(false);
  });

  it('countRunning() counts only versions on this task queue, ignoring other task queues', async () => {
    const client = createFakeDeploymentsClient();
    const manager = new RunnerProcessManager({ deploymentsClient: client, k8sNamespace: NAMESPACE, runnerImage: 'img' });

    expect(await manager.countRunning('workflow-1')).toBe(0);

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v2' });
    await manager.start({ taskQueue: 'workflow-2', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });

    expect(await manager.countRunning('workflow-1')).toBe(2);

    await manager.stopVersion('workflow-1', 'v1');

    expect(await manager.countRunning('workflow-1')).toBe(1);
  });

  it('stopAll() removes every version on the task queue without touching other task queues', async () => {
    const client = createFakeDeploymentsClient();
    const manager = new RunnerProcessManager({ deploymentsClient: client, k8sNamespace: NAMESPACE, runnerImage: 'img' });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v2' });
    await manager.start({ taskQueue: 'workflow-2', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });

    await manager.stopAll('workflow-1');

    expect(await manager.isAnyRunning('workflow-1')).toBe(false);
    expect(await manager.isRunning('workflow-2', 'v1')).toBe(true);
  });

  it('stopEverything() removes every runner Deployment regardless of task queue', async () => {
    const client = createFakeDeploymentsClient();
    const manager = new RunnerProcessManager({ deploymentsClient: client, k8sNamespace: NAMESPACE, runnerImage: 'img' });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });
    await manager.start({ taskQueue: 'workflow-2', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });

    await manager.stopEverything();

    expect(client.deployments.size).toBe(0);
  });
});
