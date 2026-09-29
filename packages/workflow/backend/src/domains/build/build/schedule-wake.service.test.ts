import type { IScheduleClientPort, IScheduleStateWithTarget } from '@falang/workflow-gateway';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDueForWake, ScheduleWakeService, type IScheduleWakeRunnerPort } from './schedule-wake.service.js';

const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const WINDOW_MS = 120_000;

const buildSchedule = (overrides: Partial<IScheduleStateWithTarget> = {}): IScheduleStateWithTarget => ({
  scheduleId: 'sched-dev-doc-1',
  paused: false,
  nextFireTimes: [new Date(NOW + 60_000).toISOString()],
  lastFireTime: null,
  skippedOverlapCount: 0,
  missedCatchupCount: 0,
  projectId: 'project-1',
  env: 'dev',
  taskQueue: 'workflow-dev-project-1',
  ...overrides,
});

describe('isDueForWake', () => {
  it('is due when the next fire is within the window', () => {
    expect(isDueForWake(buildSchedule({ nextFireTimes: [new Date(NOW + 60_000).toISOString()] }), NOW, WINDOW_MS)).toBe(true);
  });

  it('is not due when the next fire is beyond the window', () => {
    expect(isDueForWake(buildSchedule({ nextFireTimes: [new Date(NOW + 600_000).toISOString()] }), NOW, WINDOW_MS)).toBe(false);
  });

  it('is not due for a paused schedule, regardless of next fire time', () => {
    expect(isDueForWake(buildSchedule({ paused: true, nextFireTimes: [new Date(NOW + 1000).toISOString()] }), NOW, WINDOW_MS)).toBe(
      false,
    );
  });

  it('is not due when there is no next fire time at all', () => {
    expect(isDueForWake(buildSchedule({ nextFireTimes: [] }), NOW, WINDOW_MS)).toBe(false);
  });

  it('is due for an overdue fire (already in the past)', () => {
    expect(isDueForWake(buildSchedule({ nextFireTimes: [new Date(NOW - 1000).toISOString()] }), NOW, WINDOW_MS)).toBe(true);
  });
});

const buildFakes = (
  schedules: readonly IScheduleStateWithTarget[],
): { readonly service: ScheduleWakeService; readonly ensureRunnerRunning: ReturnType<typeof vi.fn> } => {
  const ensureRunnerRunning = vi.fn().mockResolvedValue(null);
  const runnerPort: IScheduleWakeRunnerPort = { ensureRunnerRunning };
  const scheduleClient = { listAll: vi.fn().mockResolvedValue(schedules) } as unknown as IScheduleClientPort;
  const service = new ScheduleWakeService(runnerPort, scheduleClient);
  return { service, ensureRunnerRunning };
};

// `sweep` is private — invoked directly (cast through `unknown`) rather than driving the real 60s
// `setInterval`, same pattern as `runner-idle-sweep.service.test.ts`.
const runSweep = (service: ScheduleWakeService): Promise<void> => (service as unknown as { sweep: () => Promise<void> }).sweep();

describe('ScheduleWakeService — sweep (0037 §5/§6)', () => {
  // `sweep()` reads real `Date.now()` internally (unlike `isDueForWake`, which takes `now` as a plain
  // argument) — pin the clock so fixtures built off the fixed `NOW` constant land inside/outside the
  // wake window deterministically, regardless of when this suite actually runs.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wakes a dev schedule due to fire soon, without touching its idle clock', async () => {
    const { service, ensureRunnerRunning } = buildFakes([buildSchedule()]);
    await runSweep(service);
    expect(ensureRunnerRunning).toHaveBeenCalledWith('project-1', 'dev', 'workflow-dev-project-1', { touch: false });
  });

  it('wakes a prod schedule due to fire soon, touching its idle clock', async () => {
    const { service, ensureRunnerRunning } = buildFakes([
      buildSchedule({ scheduleId: 'sched-prod-doc-1', env: 'prod', taskQueue: 'workflow-project-1' }),
    ]);
    await runSweep(service);
    expect(ensureRunnerRunning).toHaveBeenCalledWith('project-1', 'prod', 'workflow-project-1', { touch: true });
  });

  it('does not wake a paused schedule', async () => {
    const { service, ensureRunnerRunning } = buildFakes([buildSchedule({ paused: true })]);
    await runSweep(service);
    expect(ensureRunnerRunning).not.toHaveBeenCalled();
  });

  it('does not wake a schedule whose next fire is far away', async () => {
    const { service, ensureRunnerRunning } = buildFakes([buildSchedule({ nextFireTimes: [new Date(NOW + 3_600_000).toISOString()] })]);
    await runSweep(service);
    expect(ensureRunnerRunning).not.toHaveBeenCalled();
  });

  it('logs but does not throw when ensureRunnerRunning rejects for one schedule', async () => {
    const { service, ensureRunnerRunning } = buildFakes([buildSchedule(), buildSchedule({ scheduleId: 'sched-dev-doc-2', projectId: 'project-2' })]);
    ensureRunnerRunning.mockRejectedValueOnce(new Error('boom'));
    await expect(runSweep(service)).resolves.toBeUndefined();
    expect(ensureRunnerRunning).toHaveBeenCalledTimes(2);
  });
});
