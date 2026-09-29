import { action, makeObservable, observable } from 'mobx';

/**
 * Whether the "Language" settings modal is open — same tiny module-level singleton pattern as
 * `versioning-settings-modal-store.ts`'s `VersioningSettingsModalStore`, kept separate since the
 * two modals are opened from two different "Settings" menu items and have nothing else in common.
 */
class LanguageSettingsModalStore {
  @observable isOpen = false;

  constructor() {
    makeObservable(this);
  }

  @action open(): void {
    this.isOpen = true;
  }

  @action close(): void {
    this.isOpen = false;
  }
}

export const languageSettingsModalStore = new LanguageSettingsModalStore();
