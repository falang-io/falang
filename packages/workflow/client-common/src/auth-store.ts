import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import {
  getAuthToken,
  setAuthToken,
  setUnauthorizedHandler,
  workflowApi,
  type IApiAuthConfig,
  type IApiUser,
} from './api-client.js';

/** No-op if the shared `I18NStore` is already on this language — `setLanguage` itself also skips
 * re-fetching any already-loaded module bundle, but this avoids even the redundant `changeLanguage` call. */
const syncI18nLanguage = (language: string): void => {
  const i18n = getGlobalI18n();
  if (i18n.language === language) return;
  i18n.setLanguage(language).catch((error: unknown) => {
    // oxlint-disable-next-line no-console
    console.error('Failed to sync UI language', error);
  });
};

/**
 * Owns login/logout and the "is there already a valid token from a previous visit" check that
 * runs once on startup — the app shows a login screen until this resolves one way or the other.
 */
export class AuthStore {
  @observable currentUser: IApiUser | null = null;
  @observable isAuthChecked = false;
  @observable loginError: string | null = null;
  @observable isLoggingIn = false;
  /** `GET /auth/config`, fetched lazily by the login page; `null` until loaded (or if the fetch failed — treated as signup off). */
  @observable authConfig: IApiAuthConfig | null = null;
  /** Shared by every entry point (user menu button, default-password banner) so one modal serves them all. */
  @observable isChangePasswordOpen = false;

  constructor() {
    makeObservable(this);
    setUnauthorizedHandler(() => this.logout());
    this.checkExistingToken();
  }

  private async checkExistingToken(): Promise<void> {
    if (!getAuthToken()) {
      runInAction(() => {
        this.isAuthChecked = true;
      });
      return;
    }
    try {
      const user = await workflowApi.me();
      syncI18nLanguage(user.language);
      runInAction(() => {
        this.currentUser = user;
        this.isAuthChecked = true;
      });
    } catch {
      setAuthToken(null);
      runInAction(() => {
        this.isAuthChecked = true;
      });
    }
  }

  @action async login(username: string, password: string): Promise<void> {
    this.isLoggingIn = true;
    this.loginError = null;
    try {
      const result = await workflowApi.login(username, password);
      setAuthToken(result.accessToken);
      syncI18nLanguage(result.user.language);
      runInAction(() => {
        this.currentUser = result.user;
        this.isLoggingIn = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loginError = error instanceof Error ? error.message : 'Login failed';
        this.isLoggingIn = false;
      });
    }
  }

  @action async loadAuthConfig(): Promise<void> {
    try {
      const config = await workflowApi.authConfig();
      runInAction(() => {
        this.authConfig = config;
      });
    } catch {
      // Older backend / network hiccup: keep the sign-in form only.
    }
  }

  @action async register(username: string, password: string, acceptTerms: boolean): Promise<void> {
    this.isLoggingIn = true;
    this.loginError = null;
    try {
      const result = await workflowApi.register(username, password, this.authConfig?.termsUrl ? acceptTerms : null);
      setAuthToken(result.accessToken);
      syncI18nLanguage(result.user.language);
      runInAction(() => {
        this.currentUser = result.user;
        this.isLoggingIn = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loginError = error instanceof Error ? error.message : 'Sign up failed';
        this.isLoggingIn = false;
      });
    }
  }

  /** Rejects with the backend's message on a wrong current password / too-short new one. */
  @action async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await workflowApi.changePassword(currentPassword, newPassword);
    runInAction(() => {
      if (this.currentUser) this.currentUser = { ...this.currentUser, defaultPasswordInUse: false };
    });
  }

  @action setChangePasswordOpen(open: boolean): void {
    this.isChangePasswordOpen = open;
  }

  @action logout(): void {
    setAuthToken(null);
    this.currentUser = null;
    this.isChangePasswordOpen = false;
  }

  /** Called by a language-switcher UI — persists to the backend and swaps the shared `I18NStore`'s language. */
  @action.bound async setLanguage(language: string): Promise<void> {
    if (this.currentUser?.language === language) return;
    const user = await workflowApi.updateLanguage(language);
    syncI18nLanguage(user.language);
    runInAction(() => {
      this.currentUser = user;
    });
  }
}

export const authStore = new AuthStore();
