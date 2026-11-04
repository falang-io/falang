import { action, makeObservable, observable } from 'mobx';
import type { TAdminExtensionPage } from './admin-extensions.js';

export type TAdminPage =
  | 'users'
  | 'oauth-credentials'
  | 'agent-settings'
  | 'proxy'
  | 'sandbox-bots'
  | 'project-templates'
  | 'support';

/** Pages a single-user deployment (the desktop app) has no use for: there are no other users and nobody to support. */
const MULTI_USER_PAGES: ReadonlySet<TAdminPage> = new Set<TAdminPage>(['users', 'support']);

/** Whether the built-in `page` is offered; a single-user deployment drops the multi-user ones. */
export const isAdminPageAvailable = (page: TAdminPage, singleUser: boolean): boolean =>
  !singleUser || !MULTI_USER_PAGES.has(page);

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
