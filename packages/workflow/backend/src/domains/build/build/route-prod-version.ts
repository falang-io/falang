import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { DeploymentCliService } from './deployment-cli.service.js';
import type { RunnerProcessManager } from './runner-process-manager.js';

export interface IRouteProdVersionDeps {
  readonly runnerProcessManager: Pick<RunnerProcessManager, 'isRunning' | 'stopVersion'>;
  readonly deploymentCli: Pick<DeploymentCliService, 'setCurrentVersionWithRetry'>;
  /** Starts `buildId`'s runner pod (limit checks included) — called only when it isn't running yet. */
  readonly startRunner: (buildId: string) => Promise<void>;
}

const logger = new Logger('RouteProdVersion');

/**
 * Starts a published version's runner pod unless it is already running, then makes it the Worker
 * Deployment's current version so new starts are routed to it. If routing fails (the pod never
 * registered with Temporal in time, or Temporal refused), a pod started by this very call is deleted
 * again before the error is rethrown — otherwise the pod keeps running with no version routed to it,
 * and `isAnyRunning`-based checks report prod as live while nothing can actually run there. A pod
 * that was already running before the call is left alone. The error becomes a 503 naming the cause.
 */
export const startAndRouteProdVersion = async (
  deps: IRouteProdVersionDeps,
  projectId: string,
  taskQueue: string,
  buildId: string,
): Promise<void> => {
  const wasRunning = await deps.runnerProcessManager.isRunning(taskQueue, buildId);
  if (!wasRunning) await deps.startRunner(buildId);
  try {
    await deps.deploymentCli.setCurrentVersionWithRetry(projectId, taskQueue, buildId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error(`Version ${buildId} of project ${projectId} did not come online: ${detail}`);
    if (!wasRunning) {
      await deps.runnerProcessManager.stopVersion(taskQueue, buildId).catch((stopError: unknown) => {
        logger.error(
          `Failed to remove the runner of version ${buildId} of project ${projectId} after a failed start`,
          stopError instanceof Error ? stopError.stack : stopError,
        );
      });
    }
    throw new ServiceUnavailableException(`Version ${buildId} did not come online, try starting it again: ${detail}`);
  }
};
