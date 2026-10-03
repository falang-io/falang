export const SCHEDULE_VENDOR = 'schedule';

export const SCHEDULE_INTERVAL_TRIGGER_NAME = 'schedule-interval';
export const SCHEDULE_CRON_TRIGGER_NAME = 'schedule-cron';

/** The identifier a compiled `trigger-function` binds the fire payload to — see `ITriggerDescriptor.scopeVariableName`. */
export const SCHEDULE_SCOPE_VARIABLE_NAME = 'fire';

/** `IIntegrationStructType.id` for `{ scheduledAt: string, timezone: string }` — see `schedule.integration.ts`. */
export const SCHEDULE_FIRE_TYPE_ID = 'schedule/Fire';

/**
 * `ITriggerDescriptor.signalName` is a required field, but both triggers below have `delivery: 'start'`
 * (a Temporal Schedule can only ever `startWorkflow`, never signal one — see
 * ADR 0037 (private) §3) — so this value is never read by the compiler or
 * `gateway`'s discovery/signal path. Kept distinct per trigger anyway (never actually shared with
 * anything), matching the "unique dummy value" convention `webhookPath` below follows.
 */
export const SCHEDULE_INTERVAL_UNUSED_SIGNAL_NAME = 'scheduleIntervalFireUnused';
export const SCHEDULE_CRON_UNUSED_SIGNAL_NAME = 'scheduleCronFireUnused';

/**
 * `ITriggerDescriptor.webhookPath` is a required field too, for the same "always present, only
 * meaningful for `delivery: 'signal'`" reason — a schedule never receives an inbound HTTP request, and
 * `registerScheduleBackend` never calls `ctx.registerWebHook`. Distinct, documentation-only paths (no
 * route is ever actually mounted at them).
 */
export const SCHEDULE_INTERVAL_UNUSED_WEBHOOK_PATH = '/webhooks/schedule/:projectId/:credentialId/:env/interval-unused';
export const SCHEDULE_CRON_UNUSED_WEBHOOK_PATH = '/webhooks/schedule/:projectId/:credentialId/:env/cron-unused';

export const SCHEDULE_INTERVAL_EVERY_FIELD_NAME = 'every';
export const SCHEDULE_INTERVAL_UNIT_FIELD_NAME = 'unit';
export const SCHEDULE_CRON_EXPRESSION_FIELD_NAME = 'expression';
export const SCHEDULE_CRON_TIMEZONE_FIELD_NAME = 'timezone';

export const SCHEDULE_INTERVAL_UNITS = ['seconds', 'minutes', 'hours', 'days', 'weeks'] as const;
export type TScheduleIntervalUnit = (typeof SCHEDULE_INTERVAL_UNITS)[number];
