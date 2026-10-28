/**
 * The template a visitor came for (`#/templates/<key>`), remembered in `localStorage` so it survives signing up:
 * the e-mail confirmation link opens a fresh tab without the hash. Every access is guarded — storage may be
 * missing (tests, private windows) and the feature simply does nothing then.
 */
const STORAGE_KEY = 'falang:pending-template';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface IPendingTemplate {
  readonly key: string;
  readonly at: number;
}

export const rememberPendingTemplate = (key: string, now = Date.now()): void => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ key, at: now } satisfies IPendingTemplate));
  } catch {
    // Storage unavailable — nothing to remember.
  }
};

export const forgetPendingTemplate = (): void => {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
};

/** The remembered template key, unless it is older than a week; does not clear it. */
export const readPendingTemplate = (now = Date.now()): string | null => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IPendingTemplate>;
    if (typeof parsed.key !== 'string' || typeof parsed.at !== 'number' || now - parsed.at > MAX_AGE_MS) {
      forgetPendingTemplate();
      return null;
    }
    return parsed.key;
  } catch {
    return null;
  }
};
