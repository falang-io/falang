// oxlint-disable max-lines -- covers upsert (create + ScheduleAlreadyRunning->update fallback), list/listAll's
// memo-based filtering, and pause/delete, each needing its own fake Client/handle setup; not accumulated
// complexity.
import { ScheduleAlreadyRunning } from '@temporalio/client';
import type {
  Client,
  ScheduleDescription,
  ScheduleOptions,
  ScheduleSummary,
  ScheduleUpdateOptions,
} from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import { createTemporalScheduleClient } from './schedule-client.js';
import type { IUpsertScheduleTargetParams } from './schedule-client.js';

const UPSERT_PARAMS: IUpsertScheduleTargetParams = {
  scheduleId: 'sched-dev-doc-1',
  spec: { intervals: [{ every: '15 minutes' }] },
  workflowType: 'myTriggerFn',
  workflowId: 'sched-doc-1',
  args: [{ scheduledAt: '2026-09-28T10:00:00.000Z', timezone: 'UTC' }],
  taskQueue: 'workflow-dev-project-1',
  projectId: 'project-1',
  env: 'dev',
};

const buildDescription = (overrides: Partial<ScheduleDescription> = {}): ScheduleDescription =>
  ({
    scheduleId: UPSERT_PARAMS.scheduleId,
    spec: {},
    action: {
      type: 'startWorkflow',
      workflowType: UPSERT_PARAMS.workflowType,
      taskQueue: UPSERT_PARAMS.taskQueue,
      workflowId: UPSERT_PARAMS.workflowId,
      args: [...UPSERT_PARAMS.args],
    },
    policies: { overlap: 'SKIP', catchupWindow: 3_600_000, pauseOnFailure: false },
    memo: {
      falangProjectId: UPSERT_PARAMS.projectId,
      falangEnv: UPSERT_PARAMS.env,
      falangTaskQueue: UPSERT_PARAMS.taskQueue,
    },
    searchAttributes: {},
    state: { paused: false },
    info: {
      recentActions: [],
      nextActionTimes: [new Date('2026-09-28T10:15:00.000Z'), new Date('2026-09-28T10:30:00.000Z')],
      numActionsTaken: 3,
      numActionsMissedCatchupWindow: 1,
      numActionsSkippedOverlap: 2,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      runningActions: [],
    },
    ...overrides,
  }) as unknown as ScheduleDescription;

const buildSummary = (overrides: Partial<ScheduleSummary> = {}): ScheduleSummary =>
  ({
    scheduleId: UPSERT_PARAMS.scheduleId,
    memo: {
      falangProjectId: UPSERT_PARAMS.projectId,
      falangEnv: UPSERT_PARAMS.env,
      falangTaskQueue: UPSERT_PARAMS.taskQueue,
    },
    state: { paused: false },
    info: { recentActions: [], nextActionTimes: [] },
    ...overrides,
  }) as unknown as ScheduleSummary;

interface IFakeScheduleHandle {
  readonly scheduleId: string;
  readonly describe: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
}

const buildFakeHandle = (scheduleId: string, description: ScheduleDescription): IFakeScheduleHandle => ({
  scheduleId,
  describe: vi.fn().mockResolvedValue(description),
  // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
  update: vi.fn().mockResolvedValue(undefined),
  // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
  pause: vi.fn().mockResolvedValue(undefined),
  // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
  delete: vi.fn().mockResolvedValue(undefined),
});

interface IFakeClient {
  readonly schedule: {
    readonly create: ReturnType<typeof vi.fn>;
    readonly getHandle: ReturnType<typeof vi.fn>;
    readonly list: ReturnType<typeof vi.fn>;
  };
}

const buildGetClient = (client: IFakeClient) => {
  // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- a real explicit "resolves to undefined" mock return, needed so TS can infer this vi.fn()'s Promise<void> return type.
  const close = vi.fn().mockResolvedValue(undefined);
  return { getClient: vi.fn().mockResolvedValue({ client: client as unknown as Client, close }), close };
};

describe('createTemporalScheduleClient', () => {
  describe('upsert', () => {
    it('creates a new schedule with SKIP overlap/1h catchup and memo tags, unpaused, when none exists yet', async () => {
      const handle = buildFakeHandle(UPSERT_PARAMS.scheduleId, buildDescription());
      const fakeClient: IFakeClient = {
        schedule: {
          create: vi.fn().mockResolvedValue(handle),
          getHandle: vi.fn().mockReturnValue(handle),
          list: vi.fn(),
        },
      };
      const { getClient, close } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      await port.upsert(UPSERT_PARAMS);

      expect(fakeClient.schedule.create).toHaveBeenCalledTimes(1);
      const createArgs = fakeClient.schedule.create.mock.calls[0][0] as ScheduleOptions;
      expect(createArgs.scheduleId).toBe(UPSERT_PARAMS.scheduleId);
      expect(createArgs.spec).toMatchObject({ intervals: [{ every: '15 minutes' }] });
      expect(createArgs.action).toMatchObject({
        type: 'startWorkflow',
        workflowType: UPSERT_PARAMS.workflowType,
        workflowId: UPSERT_PARAMS.workflowId,
        taskQueue: UPSERT_PARAMS.taskQueue,
        args: [...UPSERT_PARAMS.args],
      });
      expect(createArgs.policies).toEqual({ overlap: 'SKIP', catchupWindow: '1h' });
      expect(createArgs.memo).toEqual({
        falangProjectId: UPSERT_PARAMS.projectId,
        falangEnv: UPSERT_PARAMS.env,
        falangTaskQueue: UPSERT_PARAMS.taskQueue,
      });
      expect(fakeClient.schedule.getHandle).not.toHaveBeenCalled();
      expect(handle.update).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('falls back to update (spec/action refreshed, unpaused) when create() throws ScheduleAlreadyRunning', async () => {
      const previousDescription = buildDescription({ state: { paused: true, note: 'stopped: dev env stopped' } });
      const handle = buildFakeHandle(UPSERT_PARAMS.scheduleId, previousDescription);
      handle.update.mockImplementation((updateFn: (previous: ScheduleDescription) => ScheduleUpdateOptions) =>
        Promise.resolve(updateFn(previousDescription)),
      );
      const fakeClient: IFakeClient = {
        schedule: {
          create: vi.fn().mockRejectedValue(new ScheduleAlreadyRunning('already running', UPSERT_PARAMS.scheduleId)),
          getHandle: vi.fn().mockReturnValue(handle),
          list: vi.fn(),
        },
      };
      const { getClient } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      await port.upsert(UPSERT_PARAMS);

      expect(fakeClient.schedule.getHandle).toHaveBeenCalledWith(UPSERT_PARAMS.scheduleId);
      expect(handle.update).toHaveBeenCalledTimes(1);
      const updateResult = (await handle.update.mock.results[0].value) as ScheduleUpdateOptions;
      expect(updateResult.state).toEqual({ paused: false, note: 'stopped: dev env stopped' });
      expect(updateResult.action).toMatchObject({ workflowType: UPSERT_PARAMS.workflowType });
      expect(updateResult.policies).toEqual({ overlap: 'SKIP', catchupWindow: '1h' });
    });

    it('overrides the previous note with the new one when a note is given on update', async () => {
      const previousDescription = buildDescription({ state: { paused: true, note: 'old note' } });
      const handle = buildFakeHandle(UPSERT_PARAMS.scheduleId, previousDescription);
      handle.update.mockImplementation((updateFn: (previous: ScheduleDescription) => ScheduleUpdateOptions) =>
        Promise.resolve(updateFn(previousDescription)),
      );
      const fakeClient: IFakeClient = {
        schedule: {
          create: vi.fn().mockRejectedValue(new ScheduleAlreadyRunning('already running', UPSERT_PARAMS.scheduleId)),
          getHandle: vi.fn().mockReturnValue(handle),
          list: vi.fn(),
        },
      };
      const { getClient } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      await port.upsert({ ...UPSERT_PARAMS, note: 'reconciled' });

      const updateResult = (await handle.update.mock.results[0].value) as ScheduleUpdateOptions;
      expect(updateResult.state).toEqual({ paused: false, note: 'reconciled' });
    });

    it('rethrows any error other than ScheduleAlreadyRunning', async () => {
      const fakeClient: IFakeClient = {
        schedule: {
          create: vi.fn().mockRejectedValue(new Error('temporal unreachable')),
          getHandle: vi.fn(),
          list: vi.fn(),
        },
      };
      const { getClient, close } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      await expect(port.upsert(UPSERT_PARAMS)).rejects.toThrow('temporal unreachable');
      expect(close).toHaveBeenCalledTimes(1);
    });
  });

  describe('list/listAll', () => {
    it('lists only schedules whose memo.falangTaskQueue matches, describing each for the full state', async () => {
      const matchingDescription = buildDescription();
      const matchingHandle = buildFakeHandle(UPSERT_PARAMS.scheduleId, matchingDescription);
      const otherTaskQueue = 'workflow-dev-project-2';
      const fakeClient: IFakeClient = {
        schedule: {
          create: vi.fn(),
          getHandle: vi.fn((scheduleId: string) =>
            scheduleId === UPSERT_PARAMS.scheduleId ? matchingHandle : buildFakeHandle(scheduleId, buildDescription()),
          ),
          list: vi.fn().mockImplementation(async function* listGenerator() {
            yield buildSummary();
            yield buildSummary({
              scheduleId: 'sched-dev-other',
              memo: { falangProjectId: 'project-2', falangEnv: 'dev', falangTaskQueue: otherTaskQueue },
            });
            // oxlint-disable-next-line no-undefined -- a real "schedule with no memo at all" fixture (e.g. one made outside this port, via Temporal's own CLI/UI).
            yield buildSummary({ scheduleId: 'sched-untagged', memo: undefined });
          }),
        },
      };
      const { getClient, close } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      const states = await port.list(UPSERT_PARAMS.taskQueue);

      expect(states).toHaveLength(1);
      expect(states[0]).toEqual({
        scheduleId: UPSERT_PARAMS.scheduleId,
        paused: false,
        nextFireTimes: ['2026-09-28T10:15:00.000Z', '2026-09-28T10:30:00.000Z'],
        lastFireTime: null,
        skippedOverlapCount: 2,
        missedCatchupCount: 1,
      });
      expect(matchingHandle.describe).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('reports the last fire time from the most recent action, when there is one', async () => {
      const description = buildDescription({
        info: {
          recentActions: [
            {
              scheduledAt: new Date('2026-09-28T09:45:00.000Z'),
              takenAt: new Date('2026-09-28T09:45:03.000Z'),
              action: {
                type: 'startWorkflow',
                workflow: { workflowId: 'sched-doc-1-a', firstExecutionRunId: 'run-a' },
              },
            },
            {
              scheduledAt: new Date('2026-09-28T10:00:00.000Z'),
              takenAt: new Date('2026-09-28T10:00:02.000Z'),
              action: {
                type: 'startWorkflow',
                workflow: { workflowId: 'sched-doc-1-b', firstExecutionRunId: 'run-b' },
              },
            },
          ],
          nextActionTimes: [],
          numActionsTaken: 2,
          numActionsMissedCatchupWindow: 0,
          numActionsSkippedOverlap: 0,
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          // oxlint-disable-next-line no-undefined -- `lastUpdatedAt` is a required field of this literal type, and this schedule has never been updated.
          lastUpdatedAt: undefined,
          runningActions: [],
        },
      });
      const handle = buildFakeHandle(UPSERT_PARAMS.scheduleId, description);
      const fakeClient: IFakeClient = {
        schedule: {
          create: vi.fn(),
          getHandle: vi.fn().mockReturnValue(handle),
          list: vi.fn().mockImplementation(async function* listGenerator() {
            yield buildSummary();
          }),
        },
      };
      const { getClient } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      const states = await port.list(UPSERT_PARAMS.taskQueue);

      expect(states[0]?.lastFireTime).toBe('2026-09-28T10:00:02.000Z');
    });

    it('listAll returns every tagged schedule across projects/envs, with its target attached', async () => {
      const descriptionA = buildDescription();
      const descriptionB = buildDescription({ scheduleId: 'sched-prod-doc-2' });
      const handleA = buildFakeHandle(UPSERT_PARAMS.scheduleId, descriptionA);
      const handleB = buildFakeHandle('sched-prod-doc-2', descriptionB);
      const fakeClient: IFakeClient = {
        schedule: {
          create: vi.fn(),
          getHandle: vi.fn((scheduleId: string) => (scheduleId === UPSERT_PARAMS.scheduleId ? handleA : handleB)),
          list: vi.fn().mockImplementation(async function* listGenerator() {
            yield buildSummary();
            yield buildSummary({
              scheduleId: 'sched-prod-doc-2',
              memo: { falangProjectId: 'project-2', falangEnv: 'prod', falangTaskQueue: 'workflow-project-2' },
            });
            // oxlint-disable-next-line no-undefined -- a real "schedule with no memo at all" fixture (e.g. one made outside this port, via Temporal's own CLI/UI).
            yield buildSummary({ scheduleId: 'sched-untagged', memo: undefined });
          }),
        },
      };
      const { getClient } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      const states = await port.listAll();

      expect(states.map((state) => state.scheduleId)).toEqual([UPSERT_PARAMS.scheduleId, 'sched-prod-doc-2']);
      expect(states[1]).toMatchObject({ projectId: 'project-2', env: 'prod', taskQueue: 'workflow-project-2' });
    });
  });

  describe('pause/delete', () => {
    it('pause delegates to the schedule handle with the given note', async () => {
      const handle = buildFakeHandle(UPSERT_PARAMS.scheduleId, buildDescription());
      const fakeClient: IFakeClient = {
        schedule: { create: vi.fn(), getHandle: vi.fn().mockReturnValue(handle), list: vi.fn() },
      };
      const { getClient, close } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      await port.pause(UPSERT_PARAMS.scheduleId, 'runner idle');

      expect(handle.pause).toHaveBeenCalledWith('runner idle');
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('delete delegates to the schedule handle', async () => {
      const handle = buildFakeHandle(UPSERT_PARAMS.scheduleId, buildDescription());
      const fakeClient: IFakeClient = {
        schedule: { create: vi.fn(), getHandle: vi.fn().mockReturnValue(handle), list: vi.fn() },
      };
      const { getClient, close } = buildGetClient(fakeClient);
      const port = createTemporalScheduleClient(getClient);

      await port.delete(UPSERT_PARAMS.scheduleId);

      expect(handle.delete).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
