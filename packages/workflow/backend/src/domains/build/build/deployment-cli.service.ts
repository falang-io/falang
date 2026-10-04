// oxlint-disable no-await-in-loop -- setCurrentVersionWithRetry's loop deliberately retries sequentially, one attempt at a time, not in parallel.
import type { Client } from '@temporalio/client';

/**
 * Calls the raw `SetWorkerDeploymentCurrentVersion` RPC (`@temporalio/client` has no high-level API for
 * it — confirmed in the installed SDK's types — but the generated `workflowService` exposes it). Takes
 * the namespace-bound client so the call lands in the right project's namespace and carries the
 * backend's own token (ADR 0057 (private); the `temporal` CLI this used to shell out to needed the key in
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
  /** How long `setCurrentVersionWithRetry` keeps retrying before giving up — env `RUNNER_READY_TIMEOUT_MS`, default 60 s. */
  readonly readyTimeoutMs?: number;
  /** Test seam for the clock `readyTimeoutMs` is measured against. */
  readonly now?: () => number;
}

const SET_CURRENT_VERSION_RETRY_DELAY_MS = 1000;
/**
 * A fresh runner pod needs its image, the artifact download, a Temporal token and the first poll
 * before Temporal knows its Worker Deployment exists — ~7 s on a warm local `kind` node, much longer
 * on a cold cloud node pulling the image. The previous fixed 5 × 1 s budget lost that race and left
 * the pod running with no version routed to it.
 */
export const DEFAULT_RUNNER_READY_TIMEOUT_MS = 60_000;

/**
 * gRPC codes worth waiting out while a runner registers: NOT_FOUND ("no Worker Deployment found …;
 * does your Worker Deployment have pollers?"), FAILED_PRECONDITION, UNAVAILABLE, DEADLINE_EXCEEDED.
 * An error with no gRPC code is retried too; anything else (e.g. PERMISSION_DENIED) fails at once.
 */
const RETRYABLE_GRPC_CODES = new Set([4, 5, 9, 14]);

const isRetryable = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code !== 'number' || RETRYABLE_GRPC_CODES.has(code);
};

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
  private readonly readyTimeoutMs: number;
  private readonly now: () => number;

  constructor(params: IDeploymentCliParams) {
    this.tenancy = params.tenancy;
    this.setCurrent = params.setCurrentVersion ?? defaultSetCurrentVersion;
    this.retryDelayMs = params.retryDelayMs ?? SET_CURRENT_VERSION_RETRY_DELAY_MS;
    this.readyTimeoutMs = params.readyTimeoutMs ?? DEFAULT_RUNNER_READY_TIMEOUT_MS;
    this.now = params.now ?? Date.now;
  }

  /** Makes `buildId` the routing target for new workflow starts on `deploymentName`'s task queue, in `projectId`'s namespace. */
  async setCurrentVersion(projectId: string, deploymentName: string, buildId: string): Promise<void> {
    const client = await this.tenancy.getClient(projectId);
    await this.setCurrent(client, { namespace: this.tenancy.namespaceFor(projectId), deploymentName, buildId });
  }

  /**
   * Retries `setCurrentVersion` until it succeeds or `readyTimeoutMs` runs out: right after starting a
   * new version's runner, its poller may not be registered with the matching service yet, and the call
   * fails until it is (see ADR 0004 (private)'s open follow-ups — no real readiness probe). A
   * non-retryable error (see `RETRYABLE_GRPC_CODES`) is rethrown at once.
   */
  async setCurrentVersionWithRetry(projectId: string, deploymentName: string, buildId: string): Promise<void> {
    const deadline = this.now() + this.readyTimeoutMs;
    for (;;) {
      try {
        await this.setCurrentVersion(projectId, deploymentName, buildId);
        return;
      } catch (error) {
        if (!isRetryable(error) || this.now() + this.retryDelayMs > deadline) throw error;
        await sleep(this.retryDelayMs);
      }
    }
  }
}
