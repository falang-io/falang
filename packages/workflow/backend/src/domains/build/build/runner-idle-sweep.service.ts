import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { IntegrationsRuntimeService } from '@falang/workflow-gateway';
import { ProjectRuntimeSettingsService } from '../../projects/runtime-settings/project-runtime-settings.service.js';
import { RunnerSessionsService } from '../runner-sessions/runner-sessions.service.js';
import { parseDevTaskQueue } from './task-queue-names.js';
import { RunnerProcessManager } from './runner-process-manager.js';

export const RUNNER_IDLE_TIMEOUT_MS = Symbol('RUNNER_IDLE_TIMEOUT_MS');

/** How often the sweep re-checks for idle runners — a plain interval, same style as `@falang/workflow-gateway`'s `IntegrationsRuntimeService` discovery loop; not worth its own config knob. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Periodically stops runner Deployments idle for longer than `RUNNER_IDLE_TIMEOUT_MS` — see
 * ADR 0016 (private)'s Phase 2 "Scale-to-zero" follow-up. All the
 * actual bookkeeping (what counts as idle, what "activity" touches) lives in
 * `RunnerProcessManager.stopIdleRunners()`; this service is just the timer driving it.
 *
 * Also forwards every stopped **dev** deployment to `IntegrationsRuntimeService.pauseProjectIntegrations`
 * (ADR 0037 (private) §6) — a dev schedule (`@falang/workflow-integrations-
 * schedule`'s `registerBackend`) pauses itself there via its `onRunnerIdle` hook, so a forgotten
 * short-period dev schedule doesn't keep re-waking the pod forever through `ScheduleWakeService`.
 * Prod deployments are never forwarded — prod schedules are meant to keep firing (and waking a
 * scaled-down prod pod) indefinitely.
 *
 * ADR 0067 (private): the timeout is per project and env (`ProjectRuntimeSettingsService`: the project's idle minutes,
 * or "always on" = never stopped, clamped to the owner's limits; `RUNNER_IDLE_TIMEOUT_MS` is the default), and every tick
 * ends by `reconcile`-ing the durable `runner_sessions` table against the Deployments that really exist (heartbeat,
 * `lost`, adopt-after-restart). Both collaborators are optional so a bare sweep (unit tests) keeps the old global timeout.
 */
@Injectable()
export class RunnerIdleSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunnerIdleSweepService.name);
  private readonly runnerProcessManager: RunnerProcessManager;
  private readonly idleTimeoutMs: number;
  private readonly integrationsRuntime: IntegrationsRuntimeService;
  private readonly settings: ProjectRuntimeSettingsService | undefined;
  private readonly sessions: RunnerSessionsService | undefined;
  private handle: NodeJS.Timeout | undefined;

  constructor(
    @Inject(RunnerProcessManager) runnerProcessManager: RunnerProcessManager,
    @Inject(RUNNER_IDLE_TIMEOUT_MS) idleTimeoutMs: number,
    @Inject(IntegrationsRuntimeService) integrationsRuntime: IntegrationsRuntimeService,
    @Optional() @Inject(ProjectRuntimeSettingsService) settings?: ProjectRuntimeSettingsService,
    @Optional() @Inject(RunnerSessionsService) sessions?: RunnerSessionsService,
  ) {
    this.runnerProcessManager = runnerProcessManager;
    this.idleTimeoutMs = idleTimeoutMs;
    this.integrationsRuntime = integrationsRuntime;
    this.settings = settings;
    this.sessions = sessions;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Idle sweep failed', error instanceof Error ? error.stack : error);
      });
    }, SWEEP_INTERVAL_MS);
  }

  private async sweep(): Promise<void> {
    const stopped = await this.stopIdle();
    if (stopped.length > 0) this.logger.log(`Scaled down idle runner(s): ${stopped.join(', ')}`);

    const stoppedDevProjectIds = stopped
      .map((name) => parseDevTaskQueue(name))
      .filter((projectId): projectId is string => projectId !== null);

    await Promise.all(
      stoppedDevProjectIds.map((projectId) =>
        this.integrationsRuntime.pauseProjectIntegrations(projectId, 'dev').catch((error: unknown) => {
          this.logger.error(`pauseProjectIntegrations failed for project ${projectId}`, error instanceof Error ? error.stack : error);
        }),
      ),
    );

    await this.reconcileSessions();
  }

  /** Stops what is idle by each project's own policy (or the one global timeout when no settings service is wired). */
  private async stopIdle(): Promise<readonly string[]> {
    const settings = this.settings;
    if (!settings) return this.runnerProcessManager.stopIdleRunners(this.idleTimeoutMs);
    const running = await this.runnerProcessManager.listRunning();
    const policies = await settings.resolveIdlePolicies(running.map((runner) => runner.projectId));
    return this.runnerProcessManager.stopIdleRunners(
      (runner) => (policies.get(runner.projectId) ?? settings.defaultPolicy)[runner.env],
      Date.now(),
      running,
    );
  }

  private async reconcileSessions(): Promise<void> {
    if (!this.sessions) return;
    try {
      const snapshotAt = new Date();
      const running = await this.runnerProcessManager.listRunning();
      await this.sessions.reconcile(running, new Date(), snapshotAt);
    } catch (error) {
      this.logger.error('Runner session reconcile failed', error instanceof Error ? error.stack : error);
    }
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }
}
