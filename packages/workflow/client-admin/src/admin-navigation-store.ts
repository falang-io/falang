import { action, makeObservable, observable } from 'mobx';
import type { TAdminExtensionPage } from './admin-extensions.js';

export type TAdminPage = 'users' | 'oauth-credentials' | 'agent-settings' | 'proxy' | 'project-templates' | 'support';

/** Which admin sub-page is shown — the admin app has no router either, same as the main client's `NavigationStore`. */
export class AdminNavigationStore {
  @observable page: TAdminPage | TAdminExtensionPage = 'users';

  constructor() {
    makeObservable(this);
  }

  @action setPage(page: TAdminPage | TAdminExtensionPage): void {
    this.page = page;
  }
}

export const adminNavigationStore = new AdminNavigationStore();
