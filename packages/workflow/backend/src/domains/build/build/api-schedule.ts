import type { IScheduleStateWithTarget } from '@falang/workflow-gateway';

/**
 * `GET /projects/:id/schedules`'s response shape — see ADR 0037 (private) §7
 * ("`trigger-function-body` block: ... shows schedule state (paused/active, next fire, last fire,
 * skipped-overlap count)"). One entry per Temporal Schedule reconciled for this project, dev and prod
 * alike (a project with both a dev build and a published version can have two entries for the same
 * bound document, one per `env`).
 */
export interface IApiSchedule {
  /** The bound `trigger-function` document's id — the tail of `scheduleId` after `sched-<env>-`. */
  readonly documentId: string;
  readonly env: 'dev' | 'prod';
  readonly scheduleId: string;
  readonly paused: boolean;
  /** ISO-8601 timestamps, soonest first. */
  readonly nextFireTimes: readonly string[];
  /** ISO-8601, or `null` if this schedule has never fired yet. */
  readonly lastFireTime: string | null;
  readonly skippedOverlapCount: number;
  readonly missedCatchupCount: number;
}

/**
 * `scheduleId` is always `sched-<env>-<triggerFunctionDocumentId>` (see `@falang/workflow-gateway`'s
 * `IScheduleClientPort.upsert` callers) — `null` for anything that doesn't match its own `env`'s
 * prefix, which should never happen for a schedule this port created itself, but is a cheap guard
 * against a stale/foreign schedule rather than a thrown error reaching `BuildService.listSchedules`'s
 * caller.
 */
export const toApiSchedule = (schedule: IScheduleStateWithTarget): IApiSchedule | null => {
  const prefix = `sched-${schedule.env}-`;
  if (!schedule.scheduleId.startsWith(prefix)) return null;

  return {
    documentId: schedule.scheduleId.slice(prefix.length),
    env: schedule.env,
    scheduleId: schedule.scheduleId,
    paused: schedule.paused,
    nextFireTimes: schedule.nextFireTimes,
    lastFireTime: schedule.lastFireTime,
    skippedOverlapCount: schedule.skippedOverlapCount,
    missedCatchupCount: schedule.missedCatchupCount,
  };
};
