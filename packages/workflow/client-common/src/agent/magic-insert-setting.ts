import { action, makeObservable, observable } from 'mobx';

const STORAGE_PREFIX = 'falang:magic-insert:';

const read = (key: string): boolean => {
  try {
    return typeof localStorage === 'undefined' ? true : localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
};

const write = (key: string, value: boolean): void => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable — the toggle just doesn't persist
  }
};

/** The per-user "Magic insert" toolbar toggle (ADR 0046 (private)): default on, persisted in `localStorage`. */
export class MagicInsertSetting {
  @observable enabled: boolean;

  private readonly key: string;

  constructor(userId: string | null | undefined) {
    this.key = `${STORAGE_PREFIX}${userId ?? 'anonymous'}`;
    this.enabled = read(this.key);
    makeObservable(this);
  }

  @action setEnabled(value: boolean): void {
    this.enabled = value;
    write(this.key, value);
  }
}
