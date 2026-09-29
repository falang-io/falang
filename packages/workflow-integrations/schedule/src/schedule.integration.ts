import type { TVariableInfo } from '@falang/typescript-dto';
import type {
  IFieldSelectOption,
  IIntegrationStructType,
  IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import {
  SCHEDULE_CRON_EXPRESSION_FIELD_NAME,
  SCHEDULE_CRON_TIMEZONE_FIELD_NAME,
  SCHEDULE_CRON_TRIGGER_NAME,
  SCHEDULE_CRON_UNUSED_SIGNAL_NAME,
  SCHEDULE_CRON_UNUSED_WEBHOOK_PATH,
  SCHEDULE_FIRE_TYPE_ID,
  SCHEDULE_INTERVAL_EVERY_FIELD_NAME,
  SCHEDULE_INTERVAL_TRIGGER_NAME,
  SCHEDULE_INTERVAL_UNIT_FIELD_NAME,
  SCHEDULE_INTERVAL_UNITS,
  SCHEDULE_INTERVAL_UNUSED_SIGNAL_NAME,
  SCHEDULE_INTERVAL_UNUSED_WEBHOOK_PATH,
  SCHEDULE_SCOPE_VARIABLE_NAME,
  SCHEDULE_VENDOR,
} from './constants.js';
import { registerScheduleBackend } from './schedule-backend.js';
import {
  validateScheduleCronExpression,
  validateScheduleIntervalEvery,
  validateScheduleTimezone,
} from './schedule-spec.js';

export * from './constants.js';
export * from './schedule-spec.js';

/**
 * `{ scheduledAt: string, timezone: string }` — bound to `scopeVariableName: 'fire'` on both triggers
 * below. `scheduledAt` is the fire time the Temporal Schedule *intended* (ISO-8601), not when the
 * worker actually picked the task up — the compiled `'start'`-delivery preamble overwrites it from
 * `TemporalScheduledStartTime` (see `@falang/workflow-compiler`'s `compileTriggerFunction`), so it is
 * NEVER the literal value the schedule's own `action.args` were created with (always `''`, a
 * placeholder — see `schedule-backend.ts`). `timezone` IS the static configured value, useful for a
 * function that wants to format `scheduledAt` back into local wall-clock time.
 */
export const scheduleFireType: IIntegrationStructType = {
  id: SCHEDULE_FIRE_TYPE_ID,
  name: 'ScheduleFire',
  properties: {
    scheduledAt: { type: 'string' },
    timezone: { type: 'string' },
  },
};

const scheduleFireScopeType: TVariableInfo = { type: 'struct', id: SCHEDULE_FIRE_TYPE_ID };

const SCHEDULE_INTERVAL_UNIT_OPTIONS: readonly IFieldSelectOption[] = SCHEDULE_INTERVAL_UNITS.map((unit) => ({
  value: unit,
  label: `schedule:unit.${unit}`,
}));

/**
 * Timer triggers backed by Temporal Schedules, not a `backend`-side timer loop — see
 * ADR 0037 (private). `credentialFields: []`: like `webhook`, this vendor
 * authenticates nothing external — an instance only exists to hand out a `credentialId`
 * (`GatewayModule`'s discovery synthesizes an implicit one, so a project doesn't even need to create
 * an explicit instance, see that ADR's §4 "Credential-less vendors need an implicit target"). Both
 * triggers are `delivery: 'start'`: a Temporal Schedule can only ever `startWorkflow`, never signal
 * one, so `signalName`/`webhookPath` below are present only because `ITriggerDescriptor` requires
 * them — neither is ever read for these two triggers (see `constants.ts`'s own doc comments on the
 * "unused" constants). `registerBackend` (`registerScheduleBackend`) is the actual reconcile loop —
 * it never calls `ctx.registerWebHook`/`ctx.signalWorkflow` either.
 */
export const scheduleIntegration: IWorkflowIntegration = {
  vendor: SCHEDULE_VENDOR,
  label: 'schedule:label',
  notes:
    'Timer, cron, schedule: run a workflow on a recurring time-based schedule — every N minutes/hours/' +
    'days/weeks, or a raw cron expression (e.g. daily at a fixed time, weekly on certain weekdays, ' +
    'a recurring/periodic job). No external service, no credentials — the trigger fires on its own, ' +
    'driven by a durable Temporal Schedule rather than anything external happening.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [],
  types: [scheduleFireType],
  actions: [],
  triggers: [
    {
      name: SCHEDULE_INTERVAL_TRIGGER_NAME,
      label: 'schedule:trigger.interval',
      scopeType: scheduleFireScopeType,
      scopeVariableName: SCHEDULE_SCOPE_VARIABLE_NAME,
      signalName: SCHEDULE_INTERVAL_UNUSED_SIGNAL_NAME,
      webhookPath: SCHEDULE_INTERVAL_UNUSED_WEBHOOK_PATH,
      delivery: 'start',
      contextFields: [
        {
          name: SCHEDULE_INTERVAL_EVERY_FIELD_NAME,
          label: 'schedule:field.every',
          kind: 'text',
          fieldSize: 'small',
          validate: validateScheduleIntervalEvery,
        },
        {
          name: SCHEDULE_INTERVAL_UNIT_FIELD_NAME,
          label: 'schedule:field.unit',
          kind: 'select',
          options: SCHEDULE_INTERVAL_UNIT_OPTIONS,
        },
      ],
      notes:
        'Fires repeatedly on a fixed interval — "every" (a positive whole number) times "unit" ' +
        '(seconds/minutes/hours/days/weeks), e.g. every=15, unit=minutes fires every 15 minutes, ' +
        'starting one interval after the schedule is created/resumed (not immediately). Use ' +
        'schedule-cron instead for "daily at a specific time" or "only on certain weekdays" — an ' +
        'interval trigger cannot express a fixed time of day. The bound function receives one ' +
        '`fire: { scheduledAt: string, timezone: string }` argument — `fire.scheduledAt` is the time ' +
        'THIS FIRE WAS SCHEDULED FOR (ISO-8601), not `new Date()`/the current wall-clock time; use it ' +
        'when the function needs to know which scheduled slot it is running for.',
    },
    {
      name: SCHEDULE_CRON_TRIGGER_NAME,
      label: 'schedule:trigger.cron',
      scopeType: scheduleFireScopeType,
      scopeVariableName: SCHEDULE_SCOPE_VARIABLE_NAME,
      signalName: SCHEDULE_CRON_UNUSED_SIGNAL_NAME,
      webhookPath: SCHEDULE_CRON_UNUSED_WEBHOOK_PATH,
      delivery: 'start',
      contextFields: [
        {
          name: SCHEDULE_CRON_EXPRESSION_FIELD_NAME,
          label: 'schedule:field.expression',
          kind: 'text',
          validate: validateScheduleCronExpression,
        },
        {
          name: SCHEDULE_CRON_TIMEZONE_FIELD_NAME,
          label: 'schedule:field.timezone',
          kind: 'text',
          fieldSize: 'small',
          validate: validateScheduleTimezone,
        },
      ],
      notes:
        'Fires on a cron schedule — "expression" is a STANDARD 5-FIELD cron expression: minute hour ' +
        'day-of-month month day-of-week (e.g. "0 9 * * 1-5" = 09:00 on weekdays, "*/15 * * * *" = every ' +
        '15 minutes, "0 0 1 * *" = midnight on the 1st of each month). Do NOT use a 6-field expression ' +
        'with a leading seconds field — it will be rejected. "timezone" is a required IANA zone name ' +
        '(e.g. "UTC", "Europe/Moscow") the expression is evaluated against. The bound function receives ' +
        'one `fire: { scheduledAt: string, timezone: string }` argument — `fire.scheduledAt` is the time ' +
        'THIS FIRE WAS SCHEDULED FOR (ISO-8601), not `new Date()`/the current wall-clock time.',
    },
  ],
  registerBackend: registerScheduleBackend,
};
