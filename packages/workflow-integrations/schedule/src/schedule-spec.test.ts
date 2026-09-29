import { describe, expect, it } from 'vitest';
import { SCHEDULE_CRON_TRIGGER_NAME, SCHEDULE_INTERVAL_TRIGGER_NAME } from './constants.js';
import {
  buildScheduleSpec,
  previewNextFireTimes,
  validateScheduleCronExpression,
  validateScheduleIntervalEvery,
  validateScheduleTimezone,
} from './schedule-spec.js';

describe('validateScheduleIntervalEvery', () => {
  it('accepts a plain positive integer', () => {
    expect(validateScheduleIntervalEvery('15')).toBeUndefined();
    expect(validateScheduleIntervalEvery('1')).toBeUndefined();
  });

  it('rejects zero, negatives, decimals, and non-numeric text', () => {
    expect(validateScheduleIntervalEvery('0')).toBeDefined();
    expect(validateScheduleIntervalEvery('-5')).toBeDefined();
    expect(validateScheduleIntervalEvery('1.5')).toBeDefined();
    expect(validateScheduleIntervalEvery('abc')).toBeDefined();
    expect(validateScheduleIntervalEvery('')).toBeDefined();
  });
});

describe('validateScheduleCronExpression', () => {
  it('accepts a standard 5-field expression', () => {
    expect(validateScheduleCronExpression('0 9 * * 1-5')).toBeUndefined();
    expect(validateScheduleCronExpression('*/15 * * * *')).toBeUndefined();
  });

  it('rejects a 6-field expression with a leading seconds field, with a dedicated message', () => {
    const error = validateScheduleCronExpression('*/30 * * * * *');
    expect(error).toBeDefined();
    expect(error).toContain('6-field');
  });

  it('rejects the wrong field count otherwise', () => {
    expect(validateScheduleCronExpression('* * *')).toBeDefined();
    expect(validateScheduleCronExpression('')).toBeDefined();
  });

  it('rejects a syntactically invalid expression', () => {
    expect(validateScheduleCronExpression('99 * * * *')).toBeDefined();
  });
});

describe('validateScheduleTimezone', () => {
  it('accepts a real IANA zone name', () => {
    expect(validateScheduleTimezone('UTC')).toBeUndefined();
    expect(validateScheduleTimezone('Europe/Moscow')).toBeUndefined();
  });

  it('rejects an empty value and a bogus zone name', () => {
    expect(validateScheduleTimezone('')).toBeDefined();
    expect(validateScheduleTimezone('Not/AZone')).toBeDefined();
  });
});

describe('buildScheduleSpec', () => {
  it('schedule-interval builds an intervals spec, "<n> <unit>" — a valid ms-package Duration string', () => {
    expect(buildScheduleSpec(SCHEDULE_INTERVAL_TRIGGER_NAME, { every: '15', unit: 'minutes' })).toEqual({
      intervals: [{ every: '15 minutes' }],
    });
  });

  it('schedule-interval accepts "weeks" too (a valid ms-package unit, unlike a Temporal calendar month)', () => {
    expect(buildScheduleSpec(SCHEDULE_INTERVAL_TRIGGER_NAME, { every: '2', unit: 'weeks' })).toEqual({
      intervals: [{ every: '2 weeks' }],
    });
  });

  it('schedule-interval throws for an invalid "every" or an unknown unit', () => {
    expect(() => buildScheduleSpec(SCHEDULE_INTERVAL_TRIGGER_NAME, { every: 'abc', unit: 'minutes' })).toThrow();
    expect(() => buildScheduleSpec(SCHEDULE_INTERVAL_TRIGGER_NAME, { every: '5', unit: 'fortnights' })).toThrow();
  });

  it('schedule-cron builds a cronExpressions + timeZone spec', () => {
    expect(buildScheduleSpec(SCHEDULE_CRON_TRIGGER_NAME, { expression: '0 9 * * 1-5', timezone: 'UTC' })).toEqual({
      cronExpressions: ['0 9 * * 1-5'],
      timeZone: 'UTC',
    });
  });

  it('schedule-cron throws for an invalid expression or timezone', () => {
    expect(() => buildScheduleSpec(SCHEDULE_CRON_TRIGGER_NAME, { expression: 'nonsense', timezone: 'UTC' })).toThrow();
    expect(() => buildScheduleSpec(SCHEDULE_CRON_TRIGGER_NAME, { expression: '0 9 * * 1-5', timezone: '' })).toThrow();
  });

  it('throws for an unknown trigger name', () => {
    expect(() => buildScheduleSpec('schedule-unknown', {})).toThrow();
  });
});

describe('previewNextFireTimes', () => {
  it('schedule-interval previews evenly spaced future fire times', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const times = previewNextFireTimes(SCHEDULE_INTERVAL_TRIGGER_NAME, { every: '15', unit: 'minutes' }, 3, from);
    expect(times.map((date) => date.toISOString())).toEqual([
      '2026-01-01T00:15:00.000Z',
      '2026-01-01T00:30:00.000Z',
      '2026-01-01T00:45:00.000Z',
    ]);
  });

  it('schedule-cron previews the next N fire times honoring the timezone', () => {
    // 2026-01-05 is a Monday.
    const from = new Date('2026-01-05T00:00:00.000Z');
    const times = previewNextFireTimes(
      SCHEDULE_CRON_TRIGGER_NAME,
      { expression: '0 9 * * 1-5', timezone: 'UTC' },
      2,
      from,
    );
    expect(times.map((date) => date.toISOString())).toEqual(['2026-01-05T09:00:00.000Z', '2026-01-06T09:00:00.000Z']);
  });

  it('defaults to 3 fire times and the current time when not given', () => {
    const times = previewNextFireTimes(SCHEDULE_INTERVAL_TRIGGER_NAME, { every: '1', unit: 'hours' });
    expect(times).toHaveLength(3);
  });

  it('throws for an invalid config, same as buildScheduleSpec', () => {
    expect(() =>
      previewNextFireTimes(SCHEDULE_CRON_TRIGGER_NAME, { expression: 'nonsense', timezone: 'UTC' }),
    ).toThrow();
  });
});
