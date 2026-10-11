import type { IApiRuntimeEnvSettings, IApiRuntimeSettings, IApiRuntimeSettingsInput } from './api-types.js';

/**
 * Pure logic behind the "Project servers" modal (ADR 0067 (private)) — kept free of `api-client.ts` (it reads
 * `localStorage` at module scope) so plain-node tests can import it.
 */

/** One environment's editable fields; `idleMinutes: null` = "use the deployment default". */
export interface IRuntimeEnvForm {
  alwaysOn: boolean;
  idleMinutes: number | null;
}

export interface IRuntimeSettingsForm {
  dev: IRuntimeEnvForm;
  prod: IRuntimeEnvForm;
}

export const toRuntimeForm = (settings: IApiRuntimeSettings): IRuntimeSettingsForm => ({
  dev: { alwaysOn: settings.dev.alwaysOn, idleMinutes: settings.dev.idleMinutes },
  prod: { alwaysOn: settings.prod.alwaysOn, idleMinutes: settings.prod.idleMinutes },
});

const toEnvInput = (env: IRuntimeEnvForm): IApiRuntimeEnvSettings => ({
  alwaysOn: env.alwaysOn,
  idleMinutes: env.idleMinutes,
});

/** The `PUT` body for a form; an always-on env keeps its idle value (the server stores both). */
export const buildRuntimeSettingsInput = (form: IRuntimeSettingsForm): IApiRuntimeSettingsInput => ({
  dev: toEnvInput(form.dev),
  prod: toEnvInput(form.prod),
});

export const isRuntimeFormEqual = (a: IRuntimeSettingsForm, b: IRuntimeSettingsForm): boolean =>
  a.dev.alwaysOn === b.dev.alwaysOn &&
  a.dev.idleMinutes === b.dev.idleMinutes &&
  a.prod.alwaysOn === b.prod.alwaysOn &&
  a.prod.idleMinutes === b.prod.idleMinutes;

/** `null` when fine (empty = default is fine), else a reason code the modal turns into text. */
export const validateIdleMinutes = (value: number | null, maxIdleMinutes: number): 'integer' | 'range' | null => {
  if (value === null) return null;
  if (!Number.isInteger(value)) return 'integer';
  if (value < 1 || value > maxIdleMinutes) return 'range';
  return null;
};

export const validateRuntimeForm = (
  form: IRuntimeSettingsForm,
  maxIdleMinutes: number,
): { dev: 'integer' | 'range' | null; prod: 'integer' | 'range' | null } => ({
  dev: form.dev.alwaysOn ? null : validateIdleMinutes(form.dev.idleMinutes, maxIdleMinutes),
  prod: form.prod.alwaysOn ? null : validateIdleMinutes(form.prod.idleMinutes, maxIdleMinutes),
});

/** The idle period actually in effect for an env form: the explicit value or the default; `null` while always-on. */
export const effectiveIdleMinutes = (env: IRuntimeEnvForm, defaultMinutes: number): number | null =>
  env.alwaysOn ? null : (env.idleMinutes ?? defaultMinutes);

const pad = (n: number): string => String(n).padStart(2, '0');

/** `HH:MM` in local time of an ISO timestamp; `''` for an unparsable one. */
export const formatClock = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Whole hours and minutes of a duration in ms (negative/NaN clamp to 0). */
export const splitDuration = (ms: number): { hours: number; minutes: number } => {
  const totalMinutes = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 60_000) : 0;
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
};

/** Duration of a runner session; an open one (`endedAt: null`) counts up to `now`. */
export const sessionDurationMs = (startedAt: string, endedAt: string | null, now: number): number =>
  (endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt);
