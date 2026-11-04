/* oxlint-disable no-undefined */
import type { IArduinoCliSettings } from '../arduino-cli-settings.js';
import { compareVersions, fetchLatestArduinoCliVersion } from './managed-version.js';
import type { TManagedFetch } from './managed-version.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IArduinoCliUpdateCheck {
  /** `false` when nothing was asked (not managed, switched off, throttled) or the request failed. */
  readonly checked: boolean;
  readonly latest?: string;
  readonly updateAvailable?: boolean;
  /** Set only when a request succeeded: what the caller persists. */
  readonly lastUpdateCheck?: { readonly at: string; readonly latest: string };
}

const isNewer = (latest: string, installed: string | undefined): boolean => {
  if (installed === undefined) return false;
  try {
    return compareVersions(latest, installed) > 0;
  } catch {
    return false;
  }
};

/**
 * ADR 0074 (private) §3: managed source only, `checkUpdates !== false` (or `force`), at most once a day
 * unless forced. Never throws — offline or a GitHub error is `{ checked: false }`.
 */
export const checkForArduinoCliUpdate = async (params: {
  readonly settings: IArduinoCliSettings;
  readonly now: Date;
  readonly fetch: TManagedFetch;
  readonly force?: boolean;
  readonly signal?: AbortSignal;
}): Promise<IArduinoCliUpdateCheck> => {
  const { settings, now, force = false } = params;
  if (settings.source !== 'managed') return { checked: false };
  if (!force && settings.checkUpdates === false) return { checked: false };
  const cached = settings.lastUpdateCheck;
  if (!force && cached) {
    const age = now.getTime() - new Date(cached.at).getTime();
    if (Number.isFinite(age) && age >= 0 && age < DAY_MS) {
      return {
        checked: false,
        latest: cached.latest,
        updateAvailable: isNewer(cached.latest, settings.managed?.version),
      };
    }
  }
  try {
    const latest = await fetchLatestArduinoCliVersion(params.fetch, params.signal);
    return {
      checked: true,
      latest,
      updateAvailable: isNewer(latest, settings.managed?.version),
      lastUpdateCheck: { at: now.toISOString(), latest },
    };
  } catch {
    return { checked: false };
  }
};
