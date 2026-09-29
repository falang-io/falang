// oxlint-disable no-await-in-loop -- setCurrentVersionWithRetry's loop deliberately retries sequentially, one attempt at a time, not in parallel.
export type TRunTemporalCli = (
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => Promise<{ readonly stdout: string; readonly stderr: string }>;

export interface IDeploymentCliParams {
  readonly runCli: TRunTemporalCli;
  readonly temporalAddress?: string;
  readonly namespace?: string;
}

const SET_CURRENT_VERSION_ATTEMPTS = 5;
const SET_CURRENT_VERSION_RETRY_DELAY_MS = 1000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) });

/**
 * Shells out to the `temporal` CLI to manage which Worker Deployment version is "current" — see
 * ADR 0004 (private): `@temporalio/client` has no API for this
 * (confirmed empty in the installed SDK's types/proto), it's CLI/gRPC-admin-only today.
 */
export class DeploymentCliService {
  private readonly runCli: TRunTemporalCli;
  private readonly temporalAddress: string | undefined;
  private readonly namespace: string | undefined;

  constructor(params: IDeploymentCliParams) {
    this.runCli = params.runCli;
    this.temporalAddress = params.temporalAddress;
    this.namespace = params.namespace;
  }

  /** Makes `buildId` the routing target for new workflow starts on `deploymentName`'s task queue. */
  async setCurrentVersion(deploymentName: string, buildId: string): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.temporalAddress) {
      env.TEMPORAL_ADDRESS = this.temporalAddress;
    }
    if (this.namespace) {
      env.TEMPORAL_NAMESPACE = this.namespace;
    }

    await this.runCli(
      [
        'worker',
        'deployment',
        'set-current-version',
        '--deployment-name',
        deploymentName,
        '--build-id',
        buildId,
        '--yes',
      ],
      env,
    );
  }

  /**
   * Retries `setCurrentVersion` a few times: right after starting a new version's runner, its
   * poller may not be registered with the matching service yet, and the CLI fails until it is (see
   * ADR 0004 (private)'s open follow-ups — no real readiness probe).
   */
  async setCurrentVersionWithRetry(deploymentName: string, buildId: string): Promise<void> {
    for (let attempt = 1; attempt <= SET_CURRENT_VERSION_ATTEMPTS; attempt += 1) {
      try {
        await this.setCurrentVersion(deploymentName, buildId);
        return;
      } catch (error) {
        if (attempt === SET_CURRENT_VERSION_ATTEMPTS) throw error;
        await sleep(SET_CURRENT_VERSION_RETRY_DELAY_MS);
      }
    }
  }
}
