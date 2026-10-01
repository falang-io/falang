import type { Client } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import { DeploymentCliService, type IDeploymentTenancy, type TSetCurrentVersion } from './deployment-cli.service.js';

const client = { tag: 'client-of-p1' } as unknown as Client;
const tenancy: IDeploymentTenancy = {
  namespaceFor: (projectId) => `falang-${projectId}`,
  getClient: vi.fn(() => Promise.resolve(client)),
};

describe('DeploymentCliService', () => {
  it("sets the current version through the project's own namespace client", async () => {
    const setCurrentVersion = vi.fn<TSetCurrentVersion>(() => Promise.resolve());
    const service = new DeploymentCliService({ tenancy, setCurrentVersion });

    await service.setCurrentVersion('p1', 'workflow-p1', 'v3');

    expect(tenancy.getClient).toHaveBeenCalledWith('p1');
    expect(setCurrentVersion).toHaveBeenCalledWith(client, {
      namespace: 'falang-p1',
      deploymentName: 'workflow-p1',
      buildId: 'v3',
    });
  });

  it('issues the raw SetWorkerDeploymentCurrentVersion RPC with the namespace, deployment name and build id', async () => {
    const rpc = vi.fn(() => Promise.resolve({}));
    const rawClient = { connection: { workflowService: { setWorkerDeploymentCurrentVersion: rpc } } } as unknown as Client;
    const service = new DeploymentCliService({
      tenancy: { namespaceFor: () => 'falang-p1', getClient: () => Promise.resolve(rawClient) },
    });

    await service.setCurrentVersion('p1', 'workflow-p1', 'v3');

    expect(rpc).toHaveBeenCalledWith({
      namespace: 'falang-p1',
      deploymentName: 'workflow-p1',
      buildId: 'v3',
      identity: 'falang-backend',
    });
  });

  it('propagates a rejection', async () => {
    const setCurrentVersion = vi.fn<TSetCurrentVersion>(() => Promise.reject(new Error('rpc failed')));
    const service = new DeploymentCliService({ tenancy, setCurrentVersion });

    await expect(service.setCurrentVersion('p1', 'workflow-p1', 'v3')).rejects.toThrow('rpc failed');
  });

  it('setCurrentVersionWithRetry retries after a failure and succeeds once the RPC stops rejecting', async () => {
    const setCurrentVersion = vi
      .fn<TSetCurrentVersion>()
      .mockRejectedValueOnce(new Error('not registered yet'))
      .mockResolvedValueOnce();
    const service = new DeploymentCliService({ tenancy, setCurrentVersion, retryDelayMs: 0 });

    await service.setCurrentVersionWithRetry('p1', 'workflow-p1', 'v3');

    expect(setCurrentVersion).toHaveBeenCalledTimes(2);
  });

  it('setCurrentVersionWithRetry throws once every attempt has been exhausted', async () => {
    const setCurrentVersion = vi.fn<TSetCurrentVersion>(() => Promise.reject(new Error('still not registered')));
    const service = new DeploymentCliService({ tenancy, setCurrentVersion, retryDelayMs: 0 });

    await expect(service.setCurrentVersionWithRetry('p1', 'workflow-p1', 'v3')).rejects.toThrow('still not registered');

    expect(setCurrentVersion).toHaveBeenCalledTimes(5);
  });
});
