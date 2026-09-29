// oxlint-disable max-lines -- over the default cap because of the new onRunnerIdle/onRunnerResume
// idle-pause coverage (ADR 0037 (private) §6), not accumulated complexity.
import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationDocumentRecord,
  IScheduleState,
} from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import { registerScheduleBackend } from './schedule-backend.js';

const triggerFunctionRoot = (data: Record<string, unknown>): INode => ({
  id: 'root-1',
  name: TRIGGER_FUNCTION_NAME,
  children: [
    { id: 'header-1', name: 'function-header', data: '' },
    { id: 'body-1', name: 'trigger-function-body', children: [], data },
    { id: 'footer-1', name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDoc = (id: string, name: string, data: Record<string, unknown>): IIntegrationDocumentRecord => ({
  id,
  name,
  data: null,
  root: triggerFunctionRoot(data),
});

const scheduleState = (overrides: Partial<IScheduleState> & { scheduleId: string }): IScheduleState => ({
  paused: false,
  nextFireTimes: [],
  lastFireTime: null,
  skippedOverlapCount: 0,
  missedCatchupCount: 0,
  ...overrides,
});

interface ITestCtx extends IIntegrationBackendContext {
  registeredInterval?: () => Promise<void>;
}

const buildCtx = (overrides: Partial<IIntegrationBackendContext> = {}): ITestCtx => {
  const ctx: ITestCtx = {
    vendor: 'schedule',
    credentialId: 'schedule',
    projectId: 'project-1',
    env: 'dev',
    fields: {},
    webhookUrl: null,
    taskQueue: 'workflow-dev-project-1',
    registerWebHook: vi.fn(),
    registerInterval: vi.fn((callback: () => Promise<void>) => {
      ctx.registeredInterval = callback;
    }),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi.fn().mockResolvedValue([]),
    getInternalProjectToken: vi.fn().mockReturnValue('project-token-1'),
    upsertSchedule: vi.fn().mockResolvedValue(null),
    pauseSchedule: vi.fn().mockResolvedValue(null),
    deleteSchedule: vi.fn().mockResolvedValue(null),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  return ctx;
};

const intervalDoc = (id = 'doc-1', every = '15', unit = 'minutes') =>
  triggerFunctionDoc(id, 'onTick', {
    vendor: 'schedule',
    triggerName: 'schedule-interval',
    credentialId: 'schedule',
    triggerConfig: { every, unit },
  });

describe('registerScheduleBackend', () => {
  it('reconciles once up front — upserts a schedule for each bound trigger-function', async () => {
    const ctx = buildCtx({ getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]) });
    await registerScheduleBackend(ctx);

    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);
    expect(ctx.upsertSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 'sched-dev-doc-1',
        workflowId: 'sched-doc-1',
        workflowType: 'onTick',
        spec: { intervals: [{ every: '15 minutes' }] },
        args: [{ scheduledAt: '', timezone: 'UTC' }],
      }),
    );
  });

  it('ignores trigger-functions bound to a different vendor or credential', async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([
        triggerFunctionDoc('doc-other', 'onTick', {
          vendor: 'schedule',
          triggerName: 'schedule-interval',
          credentialId: 'other-cred',
          triggerConfig: { every: '5', unit: 'minutes' },
        }),
      ]),
    });
    await registerScheduleBackend(ctx);
    expect(ctx.upsertSchedule).not.toHaveBeenCalled();
  });

  it('does not re-upsert on the next tick when triggerConfig and existing schedule state are unchanged', async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-1', paused: false })]),
    });
    await registerScheduleBackend(ctx);
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);

    await ctx.registeredInterval?.();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);
  });

  it('re-upserts once triggerConfig changes', async () => {
    const documents = [intervalDoc('doc-1', '15', 'minutes')];
    const ctx = buildCtx({
      getDocumentsByType: vi.fn(() => Promise.resolve(documents)),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-1', paused: false })]),
    });
    await registerScheduleBackend(ctx);
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);

    documents[0] = intervalDoc('doc-1', '30', 'minutes');
    await ctx.registeredInterval?.();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(2);
    expect(ctx.upsertSchedule).toHaveBeenLastCalledWith(
      expect.objectContaining({ spec: { intervals: [{ every: '30 minutes' }] } }),
    );
  });

  it('re-upserts (and thereby unpauses) a schedule Temporal reports as paused, even with unchanged config', async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-1', paused: true })]),
    });
    await registerScheduleBackend(ctx);
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);

    await ctx.registeredInterval?.();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(2);
  });

  it('deletes a schedule of this (project, env) whose bound document is gone', async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([]),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-stale', paused: false })]),
    });
    await registerScheduleBackend(ctx);
    expect(ctx.deleteSchedule).toHaveBeenCalledWith('sched-dev-doc-stale');
  });

  it('never deletes a schedule belonging to a different env — scoped by the sched-<env>- prefix', async () => {
    const ctx = buildCtx({
      env: 'dev',
      getDocumentsByType: vi.fn().mockResolvedValue([]),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-prod-doc-other', paused: false })]),
    });
    await registerScheduleBackend(ctx);
    expect(ctx.deleteSchedule).not.toHaveBeenCalled();
  });

  it('an invalid triggerConfig is skipped without throwing and without blocking the rest of the tick', async () => {
    // oxlint-disable-next-line no-empty-function -- suppresses the expected console.warn output for this test.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badDoc = triggerFunctionDoc('doc-bad', 'onTick', {
      vendor: 'schedule',
      triggerName: 'schedule-interval',
      credentialId: 'schedule',
      triggerConfig: { every: 'not-a-number', unit: 'minutes' },
    });
    const goodDoc = intervalDoc('doc-good');
    const ctx = buildCtx({ getDocumentsByType: vi.fn().mockResolvedValue([badDoc, goodDoc]) });

    await expect(registerScheduleBackend(ctx)).resolves.toBeDefined();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);
    expect(ctx.upsertSchedule).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: 'sched-dev-doc-good' }));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('doc-bad'));
    warnSpy.mockRestore();
  });

  it('dispose pauses every schedule of this (project, env), never deletes', async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-1', paused: false })]),
    });
    const handle = await registerScheduleBackend(ctx);
    expect(typeof handle).toBe('object');
    if (typeof handle === 'function') throw new Error('expected an IIntegrationBackendHandle');

    await handle.dispose();
    expect(ctx.pauseSchedule).toHaveBeenCalledWith('sched-dev-doc-1', expect.any(String));
    expect(ctx.deleteSchedule).not.toHaveBeenCalled();
  });

  it('onRunnerIdle pauses schedules for a dev target', async () => {
    const ctx = buildCtx({
      env: 'dev',
      getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-1', paused: false })]),
    });
    const handle = await registerScheduleBackend(ctx);
    if (typeof handle === 'function' || !handle.onRunnerIdle) throw new Error('expected onRunnerIdle');

    await handle.onRunnerIdle();
    expect(ctx.pauseSchedule).toHaveBeenCalledWith('sched-dev-doc-1', expect.any(String));
  });

  it('onRunnerIdle is a no-op for a prod target', async () => {
    const ctx = buildCtx({
      env: 'prod',
      taskQueue: 'workflow-project-1',
      getDocumentsByType: vi.fn().mockResolvedValue([]),
      listSchedules: vi.fn().mockResolvedValue([]),
    });
    const handle = await registerScheduleBackend(ctx);
    if (typeof handle === 'function' || !handle.onRunnerIdle) throw new Error('expected onRunnerIdle');

    await handle.onRunnerIdle();
    expect(ctx.pauseSchedule).not.toHaveBeenCalled();
    // Only the up-front reconcile call, not a wasted extra one from a prod onRunnerIdle no-op.
    expect(ctx.listSchedules).toHaveBeenCalledTimes(1);
  });

  it('after onRunnerIdle, the next reconcile tick does not re-upsert (would just re-unpause within ≤30s)', async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-1', paused: false })]),
    });
    const handle = await registerScheduleBackend(ctx);
    if (typeof handle === 'function' || !handle.onRunnerIdle) throw new Error('expected onRunnerIdle');
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);

    await handle.onRunnerIdle();
    expect(ctx.pauseSchedule).toHaveBeenCalledTimes(1);

    await ctx.registeredInterval?.();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);
  });

  it('deleting a stale schedule (bound document removed) still runs on a reconcile tick while paused by idle', async () => {
    const documents = [intervalDoc('doc-1')];
    const ctx = buildCtx({
      getDocumentsByType: vi.fn(() => Promise.resolve(documents)),
      listSchedules: vi.fn().mockResolvedValue([scheduleState({ scheduleId: 'sched-dev-doc-1', paused: false })]),
    });
    const handle = await registerScheduleBackend(ctx);
    if (typeof handle === 'function' || !handle.onRunnerIdle) throw new Error('expected onRunnerIdle');
    await handle.onRunnerIdle();

    // The bound trigger-function is gone now.
    documents.length = 0;
    await ctx.registeredInterval?.();
    expect(ctx.deleteSchedule).toHaveBeenCalledWith('sched-dev-doc-1');
    // Still just the up-front upsert — no re-upsert while paused.
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);
  });

  it('onRunnerResume clears the idle-pause flag and reconciles — re-upserting (thereby unpausing)', async () => {
    // Stateful, unlike the other tests' static mock — `paused` really does flip once `pauseSchedule` is
    // called, so `reconcile`'s own `alreadyUpToDate` check (which reads `existingState.paused`) sees
    // the same "still reported paused" state a real Temporal-backed `ctx` would after `onRunnerIdle`.
    let paused = false;
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]),
      listSchedules: vi.fn(() => Promise.resolve([scheduleState({ scheduleId: 'sched-dev-doc-1', paused })])),
      pauseSchedule: vi.fn(() => {
        paused = true;
        return Promise.resolve();
      }),
    });
    const handle = await registerScheduleBackend(ctx);
    if (typeof handle === 'function' || !handle.onRunnerIdle || !handle.onRunnerResume) {
      throw new Error('expected onRunnerIdle/onRunnerResume');
    }
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);

    await handle.onRunnerIdle();
    expect(paused).toBe(true);
    // A reconcile tick landing while still paused-by-idle must not upsert.
    await ctx.registeredInterval?.();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);

    await handle.onRunnerResume();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(2);
  });

  it('onRunnerResume is a no-op if this target was never paused by onRunnerIdle', async () => {
    const ctx = buildCtx({ getDocumentsByType: vi.fn().mockResolvedValue([intervalDoc()]) });
    const handle = await registerScheduleBackend(ctx);
    if (typeof handle === 'function' || !handle.onRunnerResume) throw new Error('expected onRunnerResume');
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);
    expect(ctx.listSchedules).toHaveBeenCalledTimes(1);

    await handle.onRunnerResume();
    expect(ctx.upsertSchedule).toHaveBeenCalledTimes(1);
    expect(ctx.listSchedules).toHaveBeenCalledTimes(1);
  });
});
