import { buildTriggerNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_CRON_TRIGGER_NAME,
  SCHEDULE_FIRE_TYPE_ID,
  SCHEDULE_INTERVAL_TRIGGER_NAME,
  SCHEDULE_VENDOR,
} from './constants.js';
import { scheduleFireType, scheduleIntegration } from './schedule.integration.js';

describe('scheduleIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([scheduleIntegration]);
    expect(configs.map((config) => config.name).toSorted()).toEqual(
      [SCHEDULE_INTERVAL_TRIGGER_NAME, SCHEDULE_CRON_TRIGGER_NAME].toSorted(),
    );
  });

  it('declares no credential fields and no actions — trigger-only, like webhook', () => {
    expect(scheduleIntegration.credentialFields).toEqual([]);
    expect(scheduleIntegration.actions).toEqual([]);
  });

  it('both triggers are delivery: start', () => {
    for (const trigger of scheduleIntegration.triggers) expect(trigger.delivery).toBe('start');
  });

  it('both triggers are bound to the schedule/Fire struct via the "fire" scope variable', () => {
    for (const trigger of scheduleIntegration.triggers) {
      expect(trigger.scopeType).toEqual({ type: 'struct', id: SCHEDULE_FIRE_TYPE_ID });
      expect(trigger.scopeVariableName).toBe('fire');
    }
  });

  it('registers the schedule/Fire struct type with scheduledAt/timezone strings', () => {
    expect(scheduleIntegration.types).toEqual([scheduleFireType]);
    expect(scheduleFireType.id).toBe(SCHEDULE_FIRE_TYPE_ID);
    expect(scheduleFireType.properties).toEqual({
      scheduledAt: { type: 'string' },
      timezone: { type: 'string' },
    });
  });

  it('schedule-interval has no editable node data (config lives on trigger-function-body.triggerConfig)', () => {
    const trigger = scheduleIntegration.triggers.find((candidate) => candidate.name === SCHEDULE_INTERVAL_TRIGGER_NAME);
    if (!trigger) throw new Error('expected schedule-interval trigger to be registered');
    expect(buildTriggerNodeConfig(trigger)).toEqual({ name: SCHEDULE_INTERVAL_TRIGGER_NAME });
  });

  it('schedule-interval contextFields: every (text, validated) + unit (select, i18n-keyed options)', () => {
    const trigger = scheduleIntegration.triggers.find((candidate) => candidate.name === SCHEDULE_INTERVAL_TRIGGER_NAME);
    const fields = trigger?.contextFields ?? [];
    expect(fields.map((field) => field.name)).toEqual(['every', 'unit']);

    const every = fields.find((field) => field.name === 'every');
    expect(every?.kind).toBe('text');
    expect(every?.validate?.('abc')).toBeDefined();
    expect(every?.validate?.('10')).toBeUndefined();

    const unit = fields.find((field) => field.name === 'unit');
    expect(unit?.kind).toBe('select');
    expect(unit?.options?.map((option) => option.value)).toEqual(['seconds', 'minutes', 'hours', 'days', 'weeks']);
    for (const option of unit?.options ?? []) expect(option.label).toBe(`schedule:unit.${option.value}`);
  });

  it('schedule-cron contextFields: expression + timezone, both validated text fields', () => {
    const trigger = scheduleIntegration.triggers.find((candidate) => candidate.name === SCHEDULE_CRON_TRIGGER_NAME);
    const fields = trigger?.contextFields ?? [];
    expect(fields.map((field) => field.name)).toEqual(['expression', 'timezone']);
    for (const field of fields) {
      expect(field.kind).toBe('text');
      expect(field.validate).toBeInstanceOf(Function);
    }
    const expression = fields.find((field) => field.name === 'expression');
    expect(expression?.validate?.('not a cron')).toBeDefined();
    expect(expression?.validate?.('0 9 * * 1-5')).toBeUndefined();
  });

  it('every trigger has a required, non-empty notes string', () => {
    for (const trigger of scheduleIntegration.triggers) expect(trigger.notes.length).toBeGreaterThan(0);
  });

  it('has a required, non-empty vendor-level notes string mentioning cron/timer/schedule keywords', () => {
    expect(scheduleIntegration.notes.length).toBeGreaterThan(0);
    expect(scheduleIntegration.notes.toLowerCase()).toContain('cron');
  });

  it('registers a registerBackend implementation, unlike action-only vendors', () => {
    expect(scheduleIntegration.registerBackend).toBeInstanceOf(Function);
  });

  it('vendor id is "schedule"', () => {
    expect(scheduleIntegration.vendor).toBe(SCHEDULE_VENDOR);
  });
});
