// Browser-safe module: this is imported both by `backend`'s reconcile loop (`schedule-backend.ts`)
// and, transitively through this package's barrel, by `@falang/workflow-client-common`'s
// `NewTriggerModal`/agent tools (see ADR 0037 (private) §7/§8) — no `node:*`
// import, no top-level `process.env` read. `cron-parser`'s own main entry is plain JS over `luxon`
// (also browser-safe), confirmed by inspecting its published `dist/index.js` before adding it here.
import { CronExpressionParser } from 'cron-parser';
import type { IScheduleSpec } from '@falang/workflow-integrations-common';
import {
  MIN_SCHEDULE_INTERVAL_SECONDS,
  SCHEDULE_CRON_EXPRESSION_FIELD_NAME,
  SCHEDULE_CRON_TIMEZONE_FIELD_NAME,
  SCHEDULE_CRON_TRIGGER_NAME,
  SCHEDULE_INTERVAL_EVERY_FIELD_NAME,
  SCHEDULE_INTERVAL_TRIGGER_NAME,
  SCHEDULE_INTERVAL_UNIT_FIELD_NAME,
  SCHEDULE_INTERVAL_UNITS,
  type TScheduleIntervalUnit,
} from './constants.js';

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

const isScheduleIntervalUnit = (value: string | undefined): value is TScheduleIntervalUnit =>
  (SCHEDULE_INTERVAL_UNITS as readonly string[]).includes(value ?? '');

/** `contextFields.every`'s `validate` — a plain positive integer, no leading zero/sign/decimal point. */
export const validateScheduleIntervalEvery = (value: string): string | undefined => {
  if (!POSITIVE_INTEGER_PATTERN.test(value.trim())) {
    return 'Enter a positive whole number (e.g. 15).';
  }
};

const SECONDS_PER_UNIT: Readonly<Record<TScheduleIntervalUnit, number>> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86_400,
  weeks: 604_800,
};

/** The `every` × `unit` period in seconds. */
export const intervalPeriodSeconds = (every: string, unit: TScheduleIntervalUnit): number =>
  Number(every.trim()) * SECONDS_PER_UNIT[unit];

/** Rejects an interval shorter than `MIN_SCHEDULE_INTERVAL_SECONDS` — "every 10 seconds" would hammer the runner. */
export const validateScheduleIntervalPeriod = (every: string, unit: TScheduleIntervalUnit): string | undefined => {
  if (intervalPeriodSeconds(every, unit) < MIN_SCHEDULE_INTERVAL_SECONDS) {
    return `The interval must be at least ${MIN_SCHEDULE_INTERVAL_SECONDS} seconds.`;
  }
};

const INTERVAL_SPEC_PATTERN = /^(\d+)\s+(seconds|minutes|hours|days|weeks)$/;
/** Cron fires sampled to find the shortest gap — enough to see a "0,1 * * * *"-style burst. */
const CRON_SAMPLE_FIRES = 30;

/**
 * The shortest period, in seconds, between two consecutive fires of `spec` (`Infinity` for an empty spec). Intervals
 * use their period; cron expressions are sampled over their next fires (a 5-field expression can't fire more often than
 * once a minute, a 6-field one is checked here too, which is what makes this a real guard server-side).
 * Used by the backend's schedule guard against `SCHEDULE_MIN_INTERVAL_SECONDS`.
 */
export const minScheduleGapSeconds = (spec: IScheduleSpec, from: Date = new Date()): number => {
  let min = Number.POSITIVE_INFINITY;
  for (const interval of spec.intervals ?? []) {
    const match = INTERVAL_SPEC_PATTERN.exec(interval.every.trim());
    if (!match) return 0;
    min = Math.min(min, Number(match[1]) * SECONDS_PER_UNIT[match[2] as TScheduleIntervalUnit]);
  }
  for (const expression of spec.cronExpressions ?? []) {
    let previous: number | null = null;
    const fires = CronExpressionParser.parse(expression, {
      currentDate: from,
      ...(spec.timeZone ? { tz: spec.timeZone } : {}),
    }).take(CRON_SAMPLE_FIRES);
    for (const fire of fires) {
      const at = fire.toDate().getTime();
      if (previous !== null) min = Math.min(min, (at - previous) / 1000);
      previous = at;
    }
  }
  return min;
};

const countCronFields = (expression: string): number => expression.trim().split(/\s+/).filter(Boolean).length;

/**
 * `contextFields.expression`'s `validate` — a standard 5-field cron expression (minute hour day month
 * weekday). A 6-field expression (a leading seconds field, which `cron-parser` otherwise accepts) is
 * rejected with a dedicated message rather than cron-parser's own generic one, since it's the one
 * malformed-but-parseable shape a user is likely to actually type (copying a 6-field example from
 * elsewhere) — see ADR 0037 (private) §2.
 */
export const validateScheduleCronExpression = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return 'Cron expression is required.';

  const fieldCount = countCronFields(trimmed);
  if (fieldCount === 6) {
    return (
      '6-field cron expressions (with a leading seconds field) are not supported — use the standard ' +
      '5-field format: minute hour day-of-month month day-of-week (e.g. "0 9 * * 1-5").'
    );
  }
  if (fieldCount !== 5) {
    return `Expected a 5-field cron expression (minute hour day-of-month month day-of-week), got ${fieldCount} field(s).`;
  }

  try {
    CronExpressionParser.parse(trimmed);
  } catch (error) {
    return `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/** `contextFields.timezone`'s `validate` — a real IANA zone name `Intl.DateTimeFormat` accepts; empty is never allowed (unlike `IFieldConfig.secretProdOptional`-style "fall back to a default" fields — a schedule's timezone is load-bearing for every fire time). */
export const validateScheduleTimezone = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return 'Timezone is required (e.g. "UTC" or "Europe/Moscow").';
  try {
    // `Intl.DateTimeFormat` is callable without `new` (ECMA-402 formatter constructors support both
    // forms) — throws a `RangeError` for an unrecognized zone, which is all the validation needed here.
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
  } catch {
    return `"${trimmed}" is not a recognized IANA timezone name (e.g. "UTC", "Europe/Moscow").`;
  }
};

/**
 * `triggerConfig` → the Temporal `ScheduleSpec` subset `IIntegrationBackendContext.upsertSchedule`
 * takes — see ADR 0037 (private) §2/§4. Throws (not a `string | undefined`
 * return) since every caller either already validated via the `validate*` functions above at creation
 * time (`NewTriggerModal`) or wants a hard failure surfaced per-document without stopping the rest of
 * the reconcile tick (`schedule-backend.ts` catches per document, see its own doc comment).
 */
export const buildScheduleSpec = (
  triggerName: string,
  triggerConfig: Readonly<Record<string, string>>,
): IScheduleSpec => {
  if (triggerName === SCHEDULE_INTERVAL_TRIGGER_NAME) {
    const every = triggerConfig[SCHEDULE_INTERVAL_EVERY_FIELD_NAME] ?? '';
    const everyError = validateScheduleIntervalEvery(every);
    if (everyError) throw new Error(`schedule-interval: ${everyError}`);

    const unit = triggerConfig[SCHEDULE_INTERVAL_UNIT_FIELD_NAME];
    if (!isScheduleIntervalUnit(unit)) {
      throw new Error(
        `schedule-interval: "${SCHEDULE_INTERVAL_UNIT_FIELD_NAME}" must be one of ${SCHEDULE_INTERVAL_UNITS.join(', ')}, got "${unit ?? ''}".`,
      );
    }
    const periodError = validateScheduleIntervalPeriod(every, unit);
    if (periodError) throw new Error(`schedule-interval: ${periodError}`);
    // `every`/`offset` are `@temporalio/common`'s own `ms`-package Duration string form (e.g.
    // "15 minutes") — `SCHEDULE_INTERVAL_UNITS`' plural English names are already valid `ms` units
    // verbatim (including "weeks"), so no per-unit mapping is needed — see `IScheduleIntervalSpec`'s
    // own doc comment in `@falang/workflow-integrations-common`.
    return { intervals: [{ every: `${every.trim()} ${unit}` }] };
  }

  if (triggerName === SCHEDULE_CRON_TRIGGER_NAME) {
    const expression = (triggerConfig[SCHEDULE_CRON_EXPRESSION_FIELD_NAME] ?? '').trim();
    const expressionError = validateScheduleCronExpression(expression);
    if (expressionError) throw new Error(`schedule-cron: ${expressionError}`);

    const timezone = (triggerConfig[SCHEDULE_CRON_TIMEZONE_FIELD_NAME] ?? '').trim();
    const timezoneError = validateScheduleTimezone(timezone);
    if (timezoneError) throw new Error(`schedule-cron: ${timezoneError}`);

    return { cronExpressions: [expression], timeZone: timezone };
  }

  throw new Error(`Unknown schedule trigger "${triggerName}".`);
};

const MS_PER_UNIT: Readonly<Record<TScheduleIntervalUnit, number>> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

/**
 * A live "next N fire times" preview for `NewTriggerModal` (§7) — cron via `cron-parser` itself
 * (honoring the configured timezone), interval via plain arithmetic off `from` (Temporal's own interval
 * schedule semantics: the first fire is one `every` after the schedule starts, not immediately).
 */
export const previewNextFireTimes = (
  triggerName: string,
  triggerConfig: Readonly<Record<string, string>>,
  count = 3,
  from: Date = new Date(),
): Date[] => {
  if (triggerName === SCHEDULE_CRON_TRIGGER_NAME) {
    const expression = (triggerConfig[SCHEDULE_CRON_EXPRESSION_FIELD_NAME] ?? '').trim();
    const timezone = (triggerConfig[SCHEDULE_CRON_TIMEZONE_FIELD_NAME] ?? '').trim();
    const expressionError = validateScheduleCronExpression(expression);
    if (expressionError) throw new Error(`schedule-cron: ${expressionError}`);
    const timezoneError = validateScheduleTimezone(timezone);
    if (timezoneError) throw new Error(`schedule-cron: ${timezoneError}`);

    const interval = CronExpressionParser.parse(expression, { currentDate: from, tz: timezone });
    return interval.take(count).map((date) => date.toDate());
  }

  if (triggerName === SCHEDULE_INTERVAL_TRIGGER_NAME) {
    const every = triggerConfig[SCHEDULE_INTERVAL_EVERY_FIELD_NAME] ?? '';
    const everyError = validateScheduleIntervalEvery(every);
    if (everyError) throw new Error(`schedule-interval: ${everyError}`);

    const unit = triggerConfig[SCHEDULE_INTERVAL_UNIT_FIELD_NAME];
    if (!isScheduleIntervalUnit(unit)) {
      throw new Error(
        `schedule-interval: "${SCHEDULE_INTERVAL_UNIT_FIELD_NAME}" must be one of ${SCHEDULE_INTERVAL_UNITS.join(', ')}, got "${unit ?? ''}".`,
      );
    }
    const stepMs = MS_PER_UNIT[unit] * Number(every.trim());
    return Array.from({ length: count }, (_unused, index) => new Date(from.getTime() + stepMs * (index + 1)));
  }

  throw new Error(`Unknown schedule trigger "${triggerName}".`);
};
