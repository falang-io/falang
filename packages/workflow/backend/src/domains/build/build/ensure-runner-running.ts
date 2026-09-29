import type { Repository } from 'typeorm';
import type { ProjectTokenService } from '../../internal-auth/project-token.service.js';
import type { DevArtifactStore } from './dev-artifact-store.service.js';
import type { DeploymentCliService } from './deployment-cli.service.js';
import type { ProjectVersion } from './project-version.entity.js';
import type { RunnerProcessManager } from './runner-process-manager.js';

export interface IEnsureRunnerRunningDeps {
  readonly runnerProcessManager: RunnerProcessManager;
  readonly devArtifacts: DevArtifactStore;
  readonly projectTokens: ProjectTokenService;
  readonly versions: Repository<ProjectVersion>;
  readonly deploymentCli: DeploymentCliService;
  /** `BuildService`'s own `startVersionRunnerIfNeeded` — reused here to (re)spawn prod's latest version the exact same way `startProd()` does. */
  readonly startVersionRunnerIfNeeded: (
    projectId: string,
    taskQueue: string,
    version: Pick<ProjectVersion, 'buildId'>,
  ) => Promise<void>;
}

export interface IEnsureRunnerRunningOptions {
  /**
   * Whether to record activity on `taskQueue` up front, before checking if a pod is already running —
   * default `true`. `ScheduleWakeService` (ADR 0037 (private) §5/§6) passes
   * `false` for `env: 'dev'`: an already-running dev pod must NOT have its idle clock reset just
   * because a schedule is about to fire on it, or a dev schedule with a period shorter than
   * `RUNNER_IDLE_TIMEOUT_MS` would keep the pod permanently warm and defeat scale-to-zero (§6's own
   * "wake service therefore does not touch() for dev targets" decision). A pod that genuinely needs
   * a cold start still gets a fresh baseline regardless of this flag, via
   * `RunnerProcessManager.start()`'s own internal `touch()`.
   */
  readonly touch?: boolean;
}

/**
 * Called by `IntegrationsRuntimeService` right before it signals a workflow on behalf of a vendor
 * trigger (Telegram/ActivePieces/webhook) — see `BuildService.onModuleInit()`. Those signals bypass
 * `BuildService.run()` entirely, so without this hook a trigger firing while its runner pod is
 * idle-scaled-down (see ADR 0016 (private)'s Phase 2 "Scale-to-zero"
 * follow-up) would queue a Temporal task nothing is polling, forever. Touches activity first by
 * default (so the sweep doesn't consider an actively-triggered pod idle even when it's already
 * running, the common case), then starts a pod only if none is up yet — see `IEnsureRunnerRunningOptions.touch`
 * for the one caller that opts out. Lives in its own file, not inlined into `BuildService`, the same
 * way `assertUnderProdVersionLimit` (`prod-version-limit.ts`) does.
 */
export const ensureRunnerRunning = async (
  deps: IEnsureRunnerRunningDeps,
  projectId: string,
  env: 'dev' | 'prod',
  taskQueue: string,
  options: IEnsureRunnerRunningOptions = {},
): Promise<void> => {
  if (options.touch ?? true) deps.runnerProcessManager.touch(taskQueue);

  if (env === 'dev') {
    if (await deps.runnerProcessManager.isRunning(taskQueue)) return;
    // Never built, or `backend` restarted and lost its in-memory dev artifact (see
    // `DevArtifactStore`'s own MVP-scope doc comment) — nothing to wake into, same as today's
    // behavior for a dev trigger firing before `build()` has ever run.
    if (!deps.devArtifacts.has(projectId)) return;
    await deps.runnerProcessManager.start({
      taskQueue,
      projectId,
      internalProjectToken: deps.projectTokens.getOrCreateToken(projectId),
      workflowEnv: 'dev',
    });
    return;
  }

  if (await deps.runnerProcessManager.isAnyRunning(taskQueue)) return;
  const latest = await deps.versions.findOne({ where: { projectId }, order: { versionNumber: 'DESC' } });
  // Nothing published yet.
  if (!latest) return;
  await deps.startVersionRunnerIfNeeded(projectId, taskQueue, latest);
  await deps.deploymentCli.setCurrentVersionWithRetry(taskQueue, latest.buildId);
};
