// oxlint-disable no-await-in-loop -- setCurrentVersionWithRetry's loop deliberately retries sequentially, one attempt at a time, not in parallel.
import type { Client } from '@temporalio/client';

/**
 * Calls the raw `SetWorkerDeploymentCurrentVersion` RPC (`@temporalio/client` has no high-level API for
 * it — confirmed in the installed SDK's types — but the generated `workflowService` exposes it). Takes
 * the namespace-bound client so the call lands in the right project's namespace and carries the
 * backend's own token (ADR 0050 (private); the `temporal` CLI this used to shell out to needed the key in
 * its env and a TLS flag).
 */
export type TSetCurrentVersion = (
  client: Client,
  params: { readonly namespace: string; readonly deploymentName: string; readonly buildId: string },
) => Promise<void>;

const defaultSetCurrentVersion: TSetCurrentVersion = async (client, { namespace, deploymentName, buildId }) => {
  await client.connection.workflowService.setWorkerDeploymentCurrentVersion({
    namespace,
    deploymentName,
    buildId,
    identity: 'falang-backend',
  });
};

/** The slice of `ITemporalTenancy` this service needs. */
export interface IDeploymentTenancy {
  namespaceFor(projectId: string): string;
  getClient(projectId: string): Promise<Client>;
}

export interface IDeploymentCliParams {
  readonly tenancy: IDeploymentTenancy;
  /** Test seam; defaults to the real raw RPC. */
  readonly setCurrentVersion?: TSetCurrentVersion;
  readonly retryDelayMs?: number;
}

const SET_CURRENT_VERSION_ATTEMPTS = 5;
const SET_CURRENT_VERSION_RETRY_DELAY_MS = 1000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) });

/**
 * Manages which Worker Deployment version is "current" — see ADR 0004 (private). The class keeps its
 * historical name from when it shelled out to the `temporal` CLI; it now issues the raw RPC through the
 * project's own namespace client.
 */
export class DeploymentCliService {
  private readonly tenancy: IDeploymentTenancy;
  private readonly setCurrent: TSetCurrentVersion;
  private readonly retryDelayMs: number;

  constructor(params: IDeploymentCliParams) {
    this.tenancy = params.tenancy;
    this.setCurrent = params.setCurrentVersion ?? defaultSetCurrentVersion;
    this.retryDelayMs = params.retryDelayMs ?? SET_CURRENT_VERSION_RETRY_DELAY_MS;
  }

  /** Makes `buildId` the routing target for new workflow starts on `deploymentName`'s task queue, in `projectId`'s namespace. */
  async setCurrentVersion(projectId: string, deploymentName: string, buildId: string): Promise<void> {
    const client = await this.tenancy.getClient(projectId);
    await this.setCurrent(client, { namespace: this.tenancy.namespaceFor(projectId), deploymentName, buildId });
  }

  /**
   * Retries `setCurrentVersion` a few times: right after starting a new version's runner, its
   * poller may not be registered with the matching service yet, and the call fails until it is (see
   * ADR 0004 (private)'s open follow-ups — no real readiness probe).
   */
  async setCurrentVersionWithRetry(projectId: string, deploymentName: string, buildId: string): Promise<void> {
    for (let attempt = 1; attempt <= SET_CURRENT_VERSION_ATTEMPTS; attempt += 1) {
      try {
        await this.setCurrentVersion(projectId, deploymentName, buildId);
        return;
      } catch (error) {
        if (attempt === SET_CURRENT_VERSION_ATTEMPTS) throw error;
        await sleep(this.retryDelayMs);
      }
    }
  }
}
