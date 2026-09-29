// oxlint-disable max-lines -- grew past 300 lines from ADR 0041 (private)'s MEDIA_SERVICE_URL
// tests, mirroring the pre-existing TELEGRAM_API_BASE_URL pair right above them; a handful of
// lines, not accumulated complexity.
import type { V1Deployment } from '@kubernetes/client-node';
import { describe, expect, it } from 'vitest';
import type { IK8sDeploymentsClient } from './k8s-deployments-client.js';
import { RunnerProcessManager, type IRunnerProcessManagerParams } from './runner-process-manager.js';

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

const envOf = (deployment: V1Deployment | undefined, name: string): string | undefined =>
  deployment?.spec?.template?.spec?.containers?.[0]?.env?.find((entry) => entry.name === name)?.value;

const createManager = (
  overrides: Partial<Omit<IRunnerProcessManagerParams, 'deploymentsClient' | 'k8sNamespace' | 'runnerImage'>> = {},
): { manager: RunnerProcessManager; client: ReturnType<typeof createFakeDeploymentsClient> } => {
  const client = createFakeDeploymentsClient();
  const manager = new RunnerProcessManager({
    deploymentsClient: client,
    k8sNamespace: NAMESPACE,
    runnerImage: 'falang/workflow-runner:test',
    ...overrides,
  });
  return { manager, client };
};

describe('RunnerProcessManager', () => {
  it('creates a Deployment with PROJECT_ID/INTERNAL_PROJECT_TOKEN/TASK_QUEUE/WORKFLOW_ENV in the container env', async () => {
    const { manager, client } = createManager();

    await manager.start({
      taskQueue: 'workflow-1',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
      workflowEnv: 'dev',
    });

    const deployment = client.deployments.get('workflow-1');
    expect(deployment?.spec?.template?.spec?.containers?.[0]?.image).toBe('falang/workflow-runner:test');
    expect(envOf(deployment, 'PROJECT_ID')).toBe('project-1');
    expect(envOf(deployment, 'INTERNAL_PROJECT_TOKEN')).toBe('token-1');
    expect(envOf(deployment, 'TASK_QUEUE')).toBe('workflow-1');
    expect(envOf(deployment, 'WORKFLOW_ENV')).toBe('dev');
    expect(await manager.isRunning('workflow-1')).toBe(true);
  });

  it('includes TEMPORAL_ADDRESS/TEMPORAL_NAMESPACE only when provided', async () => {
    const { manager, client } = createManager();

    await manager.start({
      taskQueue: 'workflow-1',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
      workflowEnv: 'dev',
      temporalAddress: 'temporal.internal:7233',
      namespace: 'prod',
    });

    const deployment = client.deployments.get('workflow-1');
    expect(envOf(deployment, 'TEMPORAL_ADDRESS')).toBe('temporal.internal:7233');
    expect(envOf(deployment, 'TEMPORAL_NAMESPACE')).toBe('prod');
  });

  it('falls back to the constructor-level temporalAddress/namespace when start() does not override them', async () => {
    const { manager, client } = createManager({ temporalAddress: 'temporal:7233', namespace: 'default' });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'project-1', internalProjectToken: 't', workflowEnv: 'dev' });

    const deployment = client.deployments.get('workflow-1');
    expect(envOf(deployment, 'TEMPORAL_ADDRESS')).toBe('temporal:7233');
    expect(envOf(deployment, 'TEMPORAL_NAMESPACE')).toBe('default');
  });

  it('start()-level temporalAddress/namespace override the constructor-level defaults', async () => {
    const { manager, client } = createManager({ temporalAddress: 'temporal:7233', namespace: 'default' });

    await manager.start({
      taskQueue: 'workflow-1',
      projectId: 'project-1',
      internalProjectToken: 't',
      workflowEnv: 'dev',
      temporalAddress: 'temporal.internal:7233',
      namespace: 'prod',
    });

    const deployment = client.deployments.get('workflow-1');
    expect(envOf(deployment, 'TEMPORAL_ADDRESS')).toBe('temporal.internal:7233');
    expect(envOf(deployment, 'TEMPORAL_NAMESPACE')).toBe('prod');
  });

  it('re-starting the same (unversioned) task queue replaces the Deployment in place', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'project-1', internalProjectToken: 't1', workflowEnv: 'dev' });
    await manager.start({ taskQueue: 'workflow-1', projectId: 'project-1', internalProjectToken: 't2', workflowEnv: 'dev' });

    expect(client.deployments.size).toBe(1);
    expect(envOf(client.deployments.get('workflow-1'), 'INTERNAL_PROJECT_TOKEN')).toBe('t2');
  });

  it('stop() deletes the Deployment and isRunning() reflects it', async () => {
    const { manager } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'project-1', internalProjectToken: 't', workflowEnv: 'dev' });
    await manager.stop('workflow-1');

    expect(await manager.isRunning('workflow-1')).toBe(false);
  });

  it('stop() is a no-op for a task queue with no running Deployment', async () => {
    const { manager } = createManager();
    await expect(manager.stop('unknown')).resolves.not.toThrow();
  });

  it('includes DEPLOYMENT_NAME/BUILD_ID only when buildId is provided, and names the Deployment "<taskQueue>-<buildId>"', async () => {
    const { manager, client } = createManager();

    await manager.start({
      taskQueue: 'workflow-1',
      projectId: 'project-1',
      internalProjectToken: 't',
      workflowEnv: 'prod',
      buildId: 'v1',
    });

    const deployment = client.deployments.get('workflow-1-v1');
    expect(envOf(deployment, 'DEPLOYMENT_NAME')).toBe('workflow-1');
    expect(envOf(deployment, 'BUILD_ID')).toBe('v1');
  });

  it('starting a second version on the same task queue does not remove the first', async () => {
    const { manager } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v2' });

    expect(await manager.isRunning('workflow-1', 'v1')).toBe(true);
    expect(await manager.isRunning('workflow-1', 'v2')).toBe(true);
  });

  it('re-starting the same version replaces that version\'s Deployment', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't1', workflowEnv: 'prod', buildId: 'v1' });
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't2', workflowEnv: 'prod', buildId: 'v1' });

    expect(client.deployments.size).toBe(1);
    expect(envOf(client.deployments.get('workflow-1-v1'), 'INTERNAL_PROJECT_TOKEN')).toBe('t2');
  });

  it('includes ARTIFACT_BASE_URL/BACKEND_INTERNAL_URL only when configured on the manager', async () => {
    const { manager, client } = createManager({ internalApiUrl: 'http://backend:4000' });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    const deployment = client.deployments.get('workflow-1');
    expect(envOf(deployment, 'ARTIFACT_BASE_URL')).toBe('http://backend:4000');
    expect(envOf(deployment, 'BACKEND_INTERNAL_URL')).toBe('http://backend:4000');
  });

  it('omits ARTIFACT_BASE_URL/BACKEND_INTERNAL_URL when not configured on the manager', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    const deployment = client.deployments.get('workflow-1');
    expect(envOf(deployment, 'ARTIFACT_BASE_URL')).toBeUndefined();
    expect(envOf(deployment, 'BACKEND_INTERNAL_URL')).toBeUndefined();
  });

  it('includes TELEGRAM_API_BASE_URL only when configured on the manager', async () => {
    const { manager, client } = createManager({ telegramApiBaseUrl: 'http://mocks:4100/telegram' });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'TELEGRAM_API_BASE_URL')).toBe('http://mocks:4100/telegram');
  });

  it('omits TELEGRAM_API_BASE_URL when not configured on the manager', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'TELEGRAM_API_BASE_URL')).toBeUndefined();
  });

  it('includes MEDIA_SERVICE_URL only when configured on the manager', async () => {
    const { manager, client } = createManager({ mediaServiceUrl: 'http://media:4200' });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'MEDIA_SERVICE_URL')).toBe('http://media:4200');
  });

  it('omits MEDIA_SERVICE_URL when not configured on the manager', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'MEDIA_SERVICE_URL')).toBeUndefined();
  });

  it('includes BACKEND_PUBLIC_URL only when configured on the manager', async () => {
    const { manager, client } = createManager({ backendPublicUrl: 'https://public.test' });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'BACKEND_PUBLIC_URL')).toBe('https://public.test');
  });

  it('omits BACKEND_PUBLIC_URL when not configured on the manager', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'BACKEND_PUBLIC_URL')).toBeUndefined();
  });

  it('sets NODE_V8_COVERAGE=/tmp on the pod when coverageEnabled is true', async () => {
    const { manager, client } = createManager({ coverageEnabled: true });

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'NODE_V8_COVERAGE')).toBe('/tmp');
  });

  it('omits NODE_V8_COVERAGE when coverageEnabled is not set', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    expect(envOf(client.deployments.get('workflow-1'), 'NODE_V8_COVERAGE')).toBeUndefined();
  });

  it('stopVersion() removes only the targeted version', async () => {
    const { manager } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });
    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v2' });
    await manager.stopVersion('workflow-1', 'v1');

    expect(await manager.isRunning('workflow-1', 'v1')).toBe(false);
    expect(await manager.isRunning('workflow-1', 'v2')).toBe(true);
  });

  it('labels the Deployment/pod template with project id, task queue and env for NetworkPolicy/ResourceQuota selectors', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'project-1', internalProjectToken: 't', workflowEnv: 'prod', buildId: 'v1' });

    const deployment = client.deployments.get('workflow-1-v1');
    expect(deployment?.metadata?.labels).toMatchObject({
      'falang.dev/project-id': 'project-1',
      'falang.dev/task-queue': 'workflow-1',
      'falang.dev/env': 'prod',
    });
    expect(deployment?.spec?.template?.metadata?.labels).toEqual(deployment?.metadata?.labels);
  });

  it('runs the pod with a restricted security posture: non-root, read-only root filesystem, no added capabilities', async () => {
    const { manager, client } = createManager();

    await manager.start({ taskQueue: 'workflow-1', projectId: 'p', internalProjectToken: 't', workflowEnv: 'dev' });

    const deployment = client.deployments.get('workflow-1');
    expect(deployment?.spec?.template?.spec?.securityContext?.runAsNonRoot).toBe(true);
    const containerSecurity = deployment?.spec?.template?.spec?.containers?.[0]?.securityContext;
    expect(containerSecurity?.readOnlyRootFilesystem).toBe(true);
    expect(containerSecurity?.allowPrivilegeEscalation).toBe(false);
    expect(containerSecurity?.capabilities?.drop).toEqual(['ALL']);
  });
});
