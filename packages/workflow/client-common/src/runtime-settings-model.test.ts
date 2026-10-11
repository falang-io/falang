import { describe, expect, it } from 'vitest';
import type { IApiRuntimeSettings } from './api-types.js';
import {
  buildRuntimeSettingsInput,
  effectiveIdleMinutes,
  isRuntimeFormEqual,
  sessionDurationMs,
  splitDuration,
  toRuntimeForm,
  validateIdleMinutes,
  validateRuntimeForm,
} from './runtime-settings-model.js';

const settings: IApiRuntimeSettings = {
  dev: { idleMinutes: null, alwaysOn: false },
  prod: { idleMinutes: 45, alwaysOn: true },
  defaults: { idleMinutes: 30 },
  limits: { maxIdleMinutes: 1440, alwaysOnAllowed: true },
  state: { dev: { running: false, since: null }, prod: { running: true, instances: 2, since: '2026-10-11T10:00:00Z' } },
  suspendedReason: null,
};

describe('runtime settings model', () => {
  it('round-trips settings through the form into the PUT body', () => {
    const form = toRuntimeForm(settings);
    expect(buildRuntimeSettingsInput(form)).toEqual({
      dev: { idleMinutes: null, alwaysOn: false },
      prod: { idleMinutes: 45, alwaysOn: true },
    });
    expect(isRuntimeFormEqual(form, toRuntimeForm(settings))).toBe(true);
    expect(isRuntimeFormEqual({ ...form, dev: { ...form.dev, alwaysOn: true } }, form)).toBe(false);
  });

  it('validates idle minutes against the owner limit', () => {
    expect(validateIdleMinutes(null, 60)).toBeNull();
    expect(validateIdleMinutes(1, 60)).toBeNull();
    expect(validateIdleMinutes(60, 60)).toBeNull();
    expect(validateIdleMinutes(0, 60)).toBe('range');
    expect(validateIdleMinutes(61, 60)).toBe('range');
    expect(validateIdleMinutes(1.5, 60)).toBe('integer');
  });

  it('does not validate the idle value of an always-on environment', () => {
    const form = toRuntimeForm(settings);
    form.prod.idleMinutes = 99_999;
    form.dev.idleMinutes = 0;
    expect(validateRuntimeForm(form, 100)).toEqual({ dev: 'range', prod: null });
  });

  it('computes the effective idle period', () => {
    expect(effectiveIdleMinutes({ alwaysOn: false, idleMinutes: null }, 30)).toBe(30);
    expect(effectiveIdleMinutes({ alwaysOn: false, idleMinutes: 5 }, 30)).toBe(5);
    expect(effectiveIdleMinutes({ alwaysOn: true, idleMinutes: 5 }, 30)).toBeNull();
  });

  it('splits durations and measures open sessions up to now', () => {
    expect(splitDuration(125 * 60 * 1000 + 59 * 1000)).toEqual({ hours: 2, minutes: 5 });
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
    const start = '2026-10-11T10:00:00Z';
    expect(sessionDurationMs(start, '2026-10-11T11:30:00Z', 0)).toBe(90 * 60 * 1000);
    expect(sessionDurationMs(start, null, Date.parse('2026-10-11T10:10:00Z'))).toBe(10 * 60 * 1000);
  });
});
