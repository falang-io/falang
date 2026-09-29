import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { IntegrationsRuntimeService } from '@falang/workflow-gateway';
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
 */
@Injectable()
export class RunnerIdleSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunnerIdleSweepService.name);
  private readonly runnerProcessManager: RunnerProcessManager;
  private readonly idleTimeoutMs: number;
  private readonly integrationsRuntime: IntegrationsRuntimeService;
  private handle: NodeJS.Timeout | undefined;

  constructor(
    @Inject(RunnerProcessManager) runnerProcessManager: RunnerProcessManager,
    @Inject(RUNNER_IDLE_TIMEOUT_MS) idleTimeoutMs: number,
    @Inject(IntegrationsRuntimeService) integrationsRuntime: IntegrationsRuntimeService,
  ) {
    this.runnerProcessManager = runnerProcessManager;
    this.idleTimeoutMs = idleTimeoutMs;
    this.integrationsRuntime = integrationsRuntime;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        this.logger.error('Idle sweep failed', error instanceof Error ? error.stack : error);
      });
    }, SWEEP_INTERVAL_MS);
  }

  private async sweep(): Promise<void> {
    const stopped = await this.runnerProcessManager.stopIdleRunners(this.idleTimeoutMs);
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
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }
}
