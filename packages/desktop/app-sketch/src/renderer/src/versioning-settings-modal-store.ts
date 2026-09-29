import { action, makeObservable, observable } from 'mobx';

/**
 * Whether the "Versioning" settings modal is open — same tiny module-level singleton pattern as
 * `settings-modal-store.ts`'s `SettingsModalStore` (ADR 0026 (private)), kept
 * separate from it since the two modals are opened from two different "Settings" menu items and
 * have nothing else in common.
 */
class VersioningSettingsModalStore {
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

export const versioningSettingsModalStore = new VersioningSettingsModalStore();
