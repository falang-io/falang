import type { IGuestProjectState } from './guest-project.js';

/**
 * A template a visitor edited without an account, kept in `localStorage` until they sign in (or sign up) —
 * then it becomes their new project (`claimGuestProjectDraft`). Written only once something was actually
 * changed: an unedited template needs no draft, the remembered template (`pending-template.ts`) covers it.
 * One draft per browser — editing another template as a guest replaces it. Every access is guarded: storage
 * may be missing or full, and the draft is then simply not kept.
 */
const STORAGE_KEY = 'falang:guest-project-draft';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DRAFT_VERSION = 1;

export interface IGuestProjectDraft {
  readonly version: typeof DRAFT_VERSION;
  /** The `#/templates/<key>` key the guest opened (an id or a slug). */
  readonly templateKey: string;
  /** The project name the import will use — the template's name. */
  readonly name: string;
  readonly savedAt: number;
  readonly state: IGuestProjectState;
}

type TStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): TStorage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Saves the draft; `false` when storage is unavailable or full. */
export const saveGuestProjectDraft = (
  draft: Omit<IGuestProjectDraft, 'version' | 'savedAt'>,
  now = Date.now(),
  storage: TStorage | null = defaultStorage(),
): boolean => {
  try {
    if (!storage) return false;
    const value: IGuestProjectDraft = { version: DRAFT_VERSION, savedAt: now, ...draft };
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const forgetGuestProjectDraft = (storage: TStorage | null = defaultStorage()): void => {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable.
  }
};

const isState = (value: unknown): value is IGuestProjectState => {
  const state = value as Partial<IGuestProjectState> | null;
  return Boolean(state) && Array.isArray(state?.folders) && Array.isArray(state?.documents);
};

/** The saved draft, unless it is malformed or older than 30 days (then it is dropped). */
export const readGuestProjectDraft = (
  now = Date.now(),
  storage: TStorage | null = defaultStorage(),
): IGuestProjectDraft | null => {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IGuestProjectDraft>;
    const valid =
      parsed.version === DRAFT_VERSION &&
      typeof parsed.templateKey === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.savedAt === 'number' &&
      now - parsed.savedAt <= MAX_AGE_MS &&
      isState(parsed.state);
    if (!valid) {
      forgetGuestProjectDraft(storage);
      return null;
    }
    return parsed as IGuestProjectDraft;
  } catch {
    return null;
  }
};
