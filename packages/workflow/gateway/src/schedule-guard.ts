import type { IScheduleSpec } from '@falang/workflow-integrations-common';
import type { Duration } from '@temporalio/common';
import { DEFAULT_SCHEDULE_CATCHUP_WINDOW } from './schedule-client.js';

/**
 * Host hook consulted before a vendor's `ctx.upsertSchedule` reaches Temporal (security audit P1-3/P1-4): the minimum
 * cadence and the owner's schedule quota live in `backend` (they need the owner and the user-limits table). Throwing
 * refuses the schedule — the vendor reports the message to the run journal and never creates it. Installed through
 * `IntegrationsRuntimeService.setScheduleGuard` (a post-construction setter, same reason as `setEnsureRunnerRunning`).
 */
export interface IScheduleGuard {
  assertAllowed(params: {
    readonly projectId: string;
    readonly env: 'dev' | 'prod';
    readonly scheduleId: string;
    readonly spec: IScheduleSpec;
  }): Promise<void>;
}

/** `SCHEDULE_CATCHUP_WINDOW_SECONDS` → a Temporal duration; unset/invalid/non-positive falls back to the default. */
export const parseScheduleCatchupWindow = (raw: string | undefined): Duration => {
  const seconds = Number(raw);
  return raw && Number.isInteger(seconds) && seconds > 0
    ? (`${seconds} seconds` as Duration)
    : DEFAULT_SCHEDULE_CATCHUP_WINDOW;
};
