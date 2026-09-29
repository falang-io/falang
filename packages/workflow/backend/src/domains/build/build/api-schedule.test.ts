import type { IScheduleStateWithTarget } from '@falang/workflow-gateway';
import { describe, expect, it } from 'vitest';
import { toApiSchedule } from './api-schedule.js';

const buildSchedule = (overrides: Partial<IScheduleStateWithTarget> = {}): IScheduleStateWithTarget => ({
  scheduleId: 'sched-dev-doc-1',
  paused: false,
  nextFireTimes: ['2026-09-29T12:01:00.000Z'],
  lastFireTime: null,
  skippedOverlapCount: 0,
  missedCatchupCount: 0,
  projectId: 'project-1',
  env: 'dev',
  taskQueue: 'workflow-dev-project-1',
  ...overrides,
});

describe('toApiSchedule', () => {
  it('recovers documentId from a dev scheduleId', () => {
    expect(toApiSchedule(buildSchedule())).toEqual({
      documentId: 'doc-1',
      env: 'dev',
      scheduleId: 'sched-dev-doc-1',
      paused: false,
      nextFireTimes: ['2026-09-29T12:01:00.000Z'],
      lastFireTime: null,
      skippedOverlapCount: 0,
      missedCatchupCount: 0,
    });
  });

  it('recovers documentId from a prod scheduleId', () => {
    const result = toApiSchedule(buildSchedule({ scheduleId: 'sched-prod-doc-2', env: 'prod', taskQueue: 'workflow-project-1' }));
    expect(result?.documentId).toBe('doc-2');
    expect(result?.env).toBe('prod');
  });

  it('returns null when scheduleId does not match its own env prefix', () => {
    expect(toApiSchedule(buildSchedule({ scheduleId: 'sched-prod-doc-1', env: 'dev' }))).toBeNull();
  });
});
