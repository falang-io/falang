import { action, makeObservable, observable } from 'mobx';

/**
 * Whether the "Agent" settings modal is open — a tiny module-level singleton, same pattern as
 * `navigation-store.ts`, so both the "Settings" menu item (main → renderer, no scheme in scope yet)
 * and the agent chat panel's own "Settings" button (inside a scheme's `ContainerContext`) can open it
 * without prop-drilling through `ProjectWorkspace`/`Sidebar`.
 */
class SettingsModalStore {
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

export const settingsModalStore = new SettingsModalStore();
