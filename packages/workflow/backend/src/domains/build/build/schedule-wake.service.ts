import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { SCHEDULE_CLIENT_PORT, type IScheduleClientPort, type IScheduleStateWithTarget } from '@falang/workflow-gateway';
import { BuildService } from './build.service.js';
import { reportIfPermissionDenied } from '../../temporal/temporal-errors.js';
import type { IEnsureRunnerRunningOptions } from './ensure-runner-running.js';

/** How often the wake sweep re-lists schedules — same cadence as `RunnerIdleSweepService`'s own timer. */
const SWEEP_INTERVAL_MS = 60_000;
/** Wake a pod once its next fire is within this many ms — 2 sweep intervals, per ADR 0037 (private) §5. */
const WAKE_WINDOW_MS = 2 * SWEEP_INTERVAL_MS;

/**
 * The one method `ScheduleWakeService` needs off `BuildService` — kept as an interface (not the
 * concrete class) so a fake satisfying just this shape can drive a unit test without constructing a
 * real `BuildService` and its long dependency chain.
 */
export interface IScheduleWakeRunnerPort {
  ensureRunnerRunning(
    projectId: string,
    env: 'dev' | 'prod',
    taskQueue: string,
    options?: IEnsureRunnerRunningOptions,
  ): Promise<void>;
}

/** Whether `schedule`'s next fire is close enough to warrant waking its pod now — exported for direct unit testing. */
export const isDueForWake = (schedule: IScheduleStateWithTarget, now: number, windowMs: number = WAKE_WINDOW_MS): boolean => {
  if (schedule.paused) return false;
  const [nextFireTime] = schedule.nextFireTimes;
  if (!nextFireTime) return false;
  return new Date(nextFireTime).getTime() - now <= windowMs;
};

/**
 * Wakes a scaled-down runner pod ahead of a schedule's next fire — see ADR 0037 (private) §5. `ensureRunnerRunning` is only ever called today on an inbound trigger signal or a
 * manual run; a Temporal Schedule's `startWorkflow` action has nothing that calls it, so without this
 * sweep a fire against a scaled-down task queue would only be *delayed* (Temporal keeps the workflow
 * task pending until a Worker polls), not lost, but could sit for as long as
 * `RUNNER_IDLE_TIMEOUT_MS` decides to leave the pod down.
 *
 * `env: 'dev'` sweeps pass `{ touch: false }` (§6) — waking an already-running dev pod must not reset
 * its idle clock, or a short-period dev schedule would keep it permanently warm and defeat scale-to-
 * zero; `RunnerIdleSweepService`'s own `pauseProjectIntegrations` forwarding is what eventually stops
 * a forgotten dev schedule from re-triggering this loop. `env: 'prod'` sweeps touch normally — prod
 * schedules are meant to keep a pod alive indefinitely once they start firing regularly.
 */
@Injectable()
export class ScheduleWakeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleWakeService.name);
  private readonly runnerPort: IScheduleWakeRunnerPort;
  private readonly scheduleClient: IScheduleClientPort;
  private handle: NodeJS.Timeout | undefined;
  private sweeping = false;

  constructor(
    @Inject(BuildService) runnerPort: IScheduleWakeRunnerPort,
    @Inject(SCHEDULE_CLIENT_PORT) scheduleClient: IScheduleClientPort,
  ) {
    this.runnerPort = runnerPort;
    this.scheduleClient = scheduleClient;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => {
      // Not reentrant — a slow `listAll()`/`ensureRunnerRunning` round trip must not overlap with the
      // next tick's own sweep.
      if (this.sweeping) return;
      this.sweeping = true;
      this.sweep()
        .catch((error: unknown) => {
          reportIfPermissionDenied(this.logger, 'schedule wake sweep', error);
          this.logger.error('Schedule wake sweep failed', error instanceof Error ? error.stack : error);
        })
        .finally(() => {
          this.sweeping = false;
        });
    }, SWEEP_INTERVAL_MS);
  }

  private async sweep(): Promise<void> {
    const schedules = await this.scheduleClient.listAll();
    const now = Date.now();

    await Promise.all(
      schedules
        .filter((schedule) => isDueForWake(schedule, now, WAKE_WINDOW_MS))
        .map((schedule) =>
          this.runnerPort
            .ensureRunnerRunning(schedule.projectId, schedule.env, schedule.taskQueue, { touch: schedule.env === 'prod' })
            .catch((error: unknown) => {
              this.logger.error(`ensureRunnerRunning failed for schedule ${schedule.scheduleId}`, error instanceof Error ? error.stack : error);
            }),
        ),
    );
  }

  onModuleDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }
}
