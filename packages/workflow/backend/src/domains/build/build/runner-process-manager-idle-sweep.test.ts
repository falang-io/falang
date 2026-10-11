// oxlint-disable no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/catch-error-name, oxc/no-map-spread -- test fakes: resolving/rejecting with nothing, small local helpers and one-off spreads read better than the lint-preferred shapes.
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

interface IRecordedCall {
  readonly kind: 'open' | 'close';
  readonly name: string;
  readonly reason?: string;
}

const createRecorderManager = (): {
  manager: RunnerProcessManager;
  client: ReturnType<typeof createFakeDeploymentsClient>;
  calls: IRecordedCall[];
} => {
  const client = createFakeDeploymentsClient();
  const calls: IRecordedCall[] = [];
  const manager = new RunnerProcessManager({
    deploymentsClient: client,
    k8sNamespace: NAMESPACE,
    runnerImage: 'falang/workflow-runner:test',
    sessions: {
      open: (runner) => {
        calls.push({ kind: 'open', name: runner.deploymentName });
        return Promise.resolve();
      },
      close: (name, reason) => {
        calls.push({ kind: 'close', name, reason });
        return Promise.resolve();
      },
    },
  });
  return { manager, client, calls };
};

const startDev = (manager: RunnerProcessManager, projectId = 'p'): Promise<void> =>
  manager.start({ taskQueue: `workflow-dev-${projectId}`, projectId, internalProjectToken: 't', workflowEnv: 'dev' });
const startProd = (manager: RunnerProcessManager, buildId: string, projectId = 'p'): Promise<void> =>
  manager.start({ taskQueue: `workflow-${projectId}`, projectId, internalProjectToken: 't', workflowEnv: 'prod', buildId });

describe('RunnerProcessManager — runner sessions (ADR 0067)', () => {
  it('opens a session on every start, with the deployment name', async () => {
    const { manager, calls } = createRecorderManager();
    await startDev(manager);
    await startProd(manager, 'v1');
    expect(calls).toEqual([
      { kind: 'open', name: 'workflow-dev-p' },
      { kind: 'open', name: 'workflow-p-v1' },
    ]);
  });

  it('closes with the matching reason on stop / stopVersion / stopAll / stopEverything / idle', async () => {
    const { manager, calls } = createRecorderManager();
    await startDev(manager);
    await manager.stop('workflow-dev-p');
    await startProd(manager, 'v1');
    await manager.stopVersion('workflow-p', 'v1');
    await startProd(manager, 'v1');
    await startProd(manager, 'v2');
    await manager.stopAll('workflow-p', 'suspended');
    await startDev(manager);
    await manager.stopEverything();
    await startDev(manager);
    await manager.stopIdleRunners(10, Date.now() + 1000);

    expect(calls.filter((c) => c.kind === 'close')).toEqual([
      { kind: 'close', name: 'workflow-dev-p', reason: 'stopped' },
      { kind: 'close', name: 'workflow-p-v1', reason: 'stopped' },
      { kind: 'close', name: 'workflow-p-v1', reason: 'suspended' },
      { kind: 'close', name: 'workflow-p-v2', reason: 'suspended' },
      { kind: 'close', name: 'workflow-dev-p', reason: 'shutdown' },
      { kind: 'close', name: 'workflow-dev-p', reason: 'idle' },
    ]);
  });

  it('a failing recorder never fails start or stop', async () => {
    const client = createFakeDeploymentsClient();
    const failing = (): Promise<void> => Promise.reject(new Error('db down'));
    const manager = new RunnerProcessManager({
      deploymentsClient: client,
      k8sNamespace: NAMESPACE,
      runnerImage: 'img',
      sessions: { open: failing, close: failing },
    });
    await expect(startDev(manager)).resolves.toBeUndefined();
    expect(client.deployments.has('workflow-dev-p')).toBe(true);
    await expect(manager.stop('workflow-dev-p')).resolves.toBeUndefined();
    expect(client.deployments.has('workflow-dev-p')).toBe(false);
  });

  it('listRunning carries the deployment creation time when the cluster reports it', async () => {
    const { manager, client } = createRecorderManager();
    await startDev(manager);
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const original = client.listAll.bind(client);
    client.listAll = async (namespace, selector) => (await original(namespace, selector)).map((item) => ({ ...item, createdAt }));
    const [runner] = await manager.listRunning();
    expect(runner?.createdAt).toEqual(createdAt);
  });
});

describe('RunnerProcessManager — per-project idle policy (ADR 0067)', () => {
  it('uses the timeout the resolver returns per runner and skips always-on ones (null)', async () => {
    const { manager, client } = createManager();
    await manager.start({ taskQueue: 'workflow-dev-a', projectId: 'a', internalProjectToken: 't', workflowEnv: 'dev' });
    await manager.start({ taskQueue: 'workflow-dev-b', projectId: 'b', internalProjectToken: 't', workflowEnv: 'dev' });
    await manager.start({ taskQueue: 'workflow-dev-c', projectId: 'c', internalProjectToken: 't', workflowEnv: 'dev' });
    const resolver = (runner: { projectId: string }): number | null =>
      ({ a: 60_000, b: null, c: 10 * 60_000 })[runner.projectId] ?? null;

    // Five minutes later: a (1 min) is idle, b (always on) is not, c (10 min) is not.
    const stopped = await manager.stopIdleRunners(resolver, Date.now() + 5 * 60_000);
    expect(stopped).toEqual(['workflow-dev-a']);
    expect(client.deployments.has('workflow-dev-b')).toBe(true);
    expect(client.deployments.has('workflow-dev-c')).toBe(true);

    // An hour later only the always-on one survives.
    await manager.stopIdleRunners(resolver, Date.now() + 60 * 60_000);
    expect([...client.deployments.keys()]).toEqual(['workflow-dev-b']);
  });

  it('keeps accepting a plain number as the one global timeout', async () => {
    const { manager, client } = createManager();
    await manager.start({ taskQueue: 'workflow-dev-a', projectId: 'a', internalProjectToken: 't', workflowEnv: 'dev' });
    expect(await manager.stopIdleRunners(1000, Date.now() + 5000)).toEqual(['workflow-dev-a']);
    expect(client.deployments.size).toBe(0);
  });
});
