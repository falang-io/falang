import { action, makeObservable, observable } from 'mobx';

export type TAdminPage = 'users' | 'oauth-credentials' | 'agent-settings' | 'project-templates';

/** Which admin sub-page is shown — the admin app has no router either, same as the main client's `NavigationStore`. */
export class AdminNavigationStore {
  @observable page: TAdminPage = 'users';

  constructor() {
    makeObservable(this);
  }

  @action setPage(page: TAdminPage): void {
    this.page = page;
  }
}

export const adminNavigationStore = new AdminNavigationStore();
