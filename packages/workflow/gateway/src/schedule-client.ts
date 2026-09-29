// oxlint-disable no-await-in-loop -- `list`/`listAll` walk `client.schedule.list()`'s async iterator and
// `describe()` each matching schedule in sequence (small, per-project scale — not a hot path); no
// benefit to firing every `describe()` concurrently against Temporal here.
import { ScheduleAlreadyRunning, ScheduleOverlapPolicy } from '@temporalio/client';
import type { Client, ScheduleDescription, ScheduleSpec as TTemporalScheduleSpec } from '@temporalio/client';
import type { Duration } from '@temporalio/common';
import type { IScheduleSpec, IScheduleState, IUpsertScheduleParams } from '@falang/workflow-integrations-common';

type TEnv = 'dev' | 'prod';

/**
 * DI token for `IScheduleClientPort` — a plain `Symbol`, not a class, since the port is an interface
 * (see `IIntegrationsRuntimeParams.scheduleClient`'s own doc comment for why `IntegrationsRuntimeService`
 * takes it as a constructor param rather than resolving it itself). Follows this codebase's existing
 * convention for non-class Nest providers (e.g. `@falang/workflow-backend`'s `RUNNER_IDLE_TIMEOUT_MS`,
 * `BUILD_OUTPUT_DIR`) — register with `{ provide: SCHEDULE_CLIENT_PORT, useFactory: ... }` and inject
 * with `@Inject(SCHEDULE_CLIENT_PORT)`.
 */
export const SCHEDULE_CLIENT_PORT = Symbol('SCHEDULE_CLIENT_PORT');

/** `IUpsertScheduleParams` plus the target scoping `@falang/workflow-integrations-common` deliberately keeps out of the browser-safe type (see that package's `backend-runtime.ts`) — `IntegrationsRuntimeService.startTarget` fills these in from the target before calling `IScheduleClientPort.upsert`. */
export interface IUpsertScheduleTargetParams extends IUpsertScheduleParams {
  readonly taskQueue: string;
  readonly projectId: string;
  readonly env: TEnv;
}

/** One schedule's state plus the target it belongs to — what `listAll()` returns, for a host-level consumer (e.g. a future `ScheduleWakeService`) that has no single ctx/`taskQueue` to scope to. */
export interface IScheduleStateWithTarget extends IScheduleState {
  readonly projectId: string;
  readonly env: TEnv;
  readonly taskQueue: string;
}

/**
 * The Temporal-facing half of `IIntegrationBackendContext`'s four schedule methods — implemented over
 * `@temporalio/client`'s `client.schedule` (`ScheduleClient`), so vendor packages
 * (`@falang/workflow-integrations-common` and everything built on it) never import `@temporalio/*`
 * themselves. See ADR 0037 (private) §4.
 */
export interface IScheduleClientPort {
  /**
   * Creates the schedule if it doesn't exist, or updates its spec/action and unpauses it if it does
   * (`ScheduleAlreadyRunning` from `client.schedule.create` is the "already exists" signal — see
   * `@temporalio/client`'s own doc comment on that error).
   */
  upsert(params: IUpsertScheduleTargetParams): Promise<void>;
  /** Pauses (never deletes) a schedule. */
  pause(scheduleId: string, note?: string): Promise<void>;
  /** Deletes a schedule outright. */
  delete(scheduleId: string): Promise<void>;
  /** Every schedule tagged with `falangTaskQueue === taskQueue` in its memo — see `upsert`'s memo tagging. */
  list(taskQueue: string): Promise<readonly IScheduleState[]>;
  /** Every schedule this Temporal namespace knows about that carries this port's own memo tags (i.e. every schedule any `upsert` call here has ever created), across every project/env. */
  listAll(): Promise<readonly IScheduleStateWithTarget[]>;
}

/** One live connected client, plus how to release it — mirrors `gateway.module.ts`'s own `signalWorkflowWithStart` connect-per-call shape (see that function's doc comment for why: no long-lived Temporal client is held by this package). */
export interface IScheduleTemporalClientHandle {
  readonly client: Client;
  readonly close: () => Promise<void>;
}

export type TGetScheduleTemporalClient = () => Promise<IScheduleTemporalClientHandle>;

interface IScheduleMemo {
  readonly falangProjectId: string;
  readonly falangEnv: TEnv;
  readonly falangTaskQueue: string;
}

const isEnv = (value: unknown): value is TEnv => value === 'dev' || value === 'prod';

/** `ScheduleSummary.memo`/`ScheduleDescription.memo` are `Record<string, unknown>` — narrows to our own tagging shape, or `undefined` for a schedule this port didn't create (e.g. one made directly through Temporal's own CLI/UI, or a stale/malformed one). */
const readMemo = (memo: Record<string, unknown> | undefined): IScheduleMemo | undefined => {
  if (!memo) return;
  const { falangProjectId, falangEnv, falangTaskQueue } = memo;
  if (typeof falangProjectId !== 'string' || typeof falangTaskQueue !== 'string' || !isEnv(falangEnv)) {
    return;
  }
  return { falangProjectId, falangEnv, falangTaskQueue };
};

/**
 * `IScheduleSpec` (browser-safe, plain `string`) → `@temporalio/client`'s own `ScheduleSpec` —
 * `every`/`offset` are already Temporal-format Duration strings (validated up front by the vendor
 * package's own `cron-parser`-backed `contextFields.validate`), just not typed as the SDK's own
 * `ms`-package `StringValue` union here since `@falang/workflow-integrations-common` can't import
 * `@temporalio/common` (browser bundle, see that package's module-level note) — cast, not reparsed.
 */
const buildTemporalScheduleSpec = (spec: IScheduleSpec): TTemporalScheduleSpec => ({
  intervals: spec.intervals?.map((interval) => ({
    every: interval.every as Duration,
    offset: interval.offset as Duration | undefined,
  })),
  // oxlint-disable-next-line no-undefined -- a real "no cron expressions" value for this optional SDK field, not an omission.
  cronExpressions: spec.cronExpressions ? [...spec.cronExpressions] : undefined,
  timezone: spec.timeZone,
});

const SCHEDULE_POLICIES = { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: '1h' } as const;

const toScheduleState = (scheduleId: string, description: ScheduleDescription): IScheduleState => ({
  scheduleId,
  paused: description.state.paused,
  nextFireTimes: description.info.nextActionTimes.map((date) => date.toISOString()),
  // oxlint-disable-next-line no-undefined -- a real "never fired yet" value, distinct from an omitted field.
  lastFireTime: description.info.recentActions.at(-1)?.takenAt.toISOString() ?? null,
  skippedOverlapCount: description.info.numActionsSkippedOverlap,
  missedCatchupCount: description.info.numActionsMissedCatchupWindow,
});

/**
 * Real `IScheduleClientPort`, connecting fresh per call (`getClient`) rather than holding a long-lived
 * `Client` — the same posture `gateway.module.ts`'s `signalWorkflowWithStart` already takes. `list`/
 * `listAll` fall back to `describe()` per matching schedule because `ScheduleSummary` (what
 * `client.schedule.list()` yields) doesn't carry `numActionsSkippedOverlap`/`numActionsMissedCatchupWindow`/
 * `recentActions` — only `ScheduleDescription` (`ScheduleHandle.describe()`) does; acceptable at the
 * per-project/per-instance scale this drives (a handful of schedules per project, not thousands).
 */
export const createTemporalScheduleClient = (getClient: TGetScheduleTemporalClient): IScheduleClientPort => ({
  async upsert(params) {
    const { client, close } = await getClient();
    try {
      const spec = buildTemporalScheduleSpec(params.spec);
      const action = {
        type: 'startWorkflow' as const,
        workflowType: params.workflowType,
        workflowId: params.workflowId,
        taskQueue: params.taskQueue,
        args: [...params.args],
      };
      // `ScheduleOptions.memo` is `Record<string, unknown>` (no index signature on `IScheduleMemo` itself,
      // by design — it's a closed shape everywhere else it's used, `readMemo` included).
      const memo: Record<string, unknown> = {
        falangProjectId: params.projectId,
        falangEnv: params.env,
        falangTaskQueue: params.taskQueue,
      } satisfies IScheduleMemo;
      try {
        await client.schedule.create({
          scheduleId: params.scheduleId,
          spec,
          action,
          policies: SCHEDULE_POLICIES,
          memo,
          // oxlint-disable-next-line no-undefined -- a real "start unpaused, no note" value for this optional SDK field, not an omission.
          state: params.note ? { note: params.note } : undefined,
        });
      } catch (error) {
        if (!(error instanceof ScheduleAlreadyRunning)) throw error;
        const handle = client.schedule.getHandle(params.scheduleId);
        await handle.update((previous) => ({
          spec,
          action,
          policies: SCHEDULE_POLICIES,
          state: { ...previous.state, paused: false, note: params.note ?? previous.state.note },
        }));
      }
    } finally {
      await close();
    }
  },

  async pause(scheduleId, note) {
    const { client, close } = await getClient();
    try {
      await client.schedule.getHandle(scheduleId).pause(note);
    } finally {
      await close();
    }
  },

  async delete(scheduleId) {
    const { client, close } = await getClient();
    try {
      await client.schedule.getHandle(scheduleId).delete();
    } finally {
      await close();
    }
  },

  async list(taskQueue) {
    const { client, close } = await getClient();
    try {
      const states: IScheduleState[] = [];
      for await (const summary of client.schedule.list()) {
        const memo = readMemo(summary.memo);
        if (!memo || memo.falangTaskQueue !== taskQueue) continue;
        const description = await client.schedule.getHandle(summary.scheduleId).describe();
        states.push(toScheduleState(summary.scheduleId, description));
      }
      return states;
    } finally {
      await close();
    }
  },

  async listAll() {
    const { client, close } = await getClient();
    try {
      const states: IScheduleStateWithTarget[] = [];
      for await (const summary of client.schedule.list()) {
        const memo = readMemo(summary.memo);
        if (!memo) continue;
        const description = await client.schedule.getHandle(summary.scheduleId).describe();
        states.push({
          ...toScheduleState(summary.scheduleId, description),
          projectId: memo.falangProjectId,
          env: memo.falangEnv,
          taskQueue: memo.falangTaskQueue,
        });
      }
      return states;
    } finally {
      await close();
    }
  },
});
