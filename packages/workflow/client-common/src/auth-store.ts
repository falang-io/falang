// oxlint-disable max-lines -- the logged-out screen state machine (apply / verify / forgot / reset) is one cohesive
// store next to login/logout; each method is a small API-call-plus-state-transition, not accumulated complexity.
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { eventTracker } from './analytics/event-tracker.js';
import {
  getAuthToken,
  setAuthToken,
  setUnauthorizedHandler,
  workflowApi,
  type IApiAuthConfig,
  type IApiUser,
} from './api-client.js';
import { ApiCodedError } from './api-coded-error.js';
import { parseAuthLinkParams, stripAuthLinkParams } from './auth-link-params.js';

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

/** Which logged-out screen the login area shows (a small state machine kept here so mail links can pick the entry screen). */
export type TAuthScreen =
  | 'signin'
  | 'signup'
  | 'check-email'
  | 'forgot'
  | 'forgot-sent'
  | 'reset'
  | 'verifying'
  | 'verified';

export type TSignupMode = 'off' | 'open' | 'application';

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
  @observable screen: TAuthScreen = 'signin';
  /** `ApiCodedError.code` of the last failed login (`not_activated` / `email_not_verified`), else `null`. */
  @observable loginErrorCode: string | null = null;
  /** What the user typed as login on the last attempt — for "send the confirmation again" (login is the e-mail). */
  @observable lastLoginIdentifier: string | null = null;
  /** Address the "check your e-mail" screen refers to. */
  @observable pendingEmail: string | null = null;
  /** Outcome of the `?verifyEmail=` link; `'error'` for a bad/expired token. */
  @observable verifyResult: 'pending_activation' | 'active' | 'error' | null = null;
  @observable resetError: string | null = null;
  /** Shown once on the sign-in screen (e.g. after a password reset). */
  @observable notice: string | null = null;
  @observable resendState: 'idle' | 'sending' | 'sent' = 'idle';
  private resetToken: string | null = null;

  constructor() {
    makeObservable(this);
    setUnauthorizedHandler(() => this.logout());
    this.consumeLinkParams();
    this.checkExistingToken();
  }

  /** Reads `?verifyEmail=` / `?resetPassword=` once at startup and removes them from the URL right away, so a reload never repeats the call. */
  private consumeLinkParams(): void {
    if (typeof location === 'undefined') return;
    const params = parseAuthLinkParams(location.search);
    if (!params.verifyEmail && !params.resetPassword) return;
    history.replaceState(null, '', `${location.pathname}${stripAuthLinkParams(location.search)}${location.hash}`);
    if (params.resetPassword) {
      this.resetToken = params.resetPassword;
      this.screen = 'reset';
    } else if (params.verifyEmail) {
      this.screen = 'verifying';
      this.verifyEmail(params.verifyEmail);
    }
  }

  @action async verifyEmail(token: string): Promise<void> {
    try {
      const result = await workflowApi.verifyEmail(token);
      runInAction(() => {
        this.verifyResult = result.status;
        this.screen = 'verified';
      });
      if (getAuthToken()) {
        // Already signed in in this tab: refresh the flag behind the "e-mail not confirmed" banner.
        const user = await workflowApi.me().catch(() => null);
        if (user) runInAction(() => (this.currentUser = user));
      }
    } catch {
      runInAction(() => {
        this.verifyResult = 'error';
        this.screen = 'verified';
      });
    }
  }

  @action setScreen(screen: TAuthScreen): void {
    this.screen = screen;
    this.loginError = null;
    this.loginErrorCode = null;
    this.resendState = 'idle';
    if (screen !== 'signin') this.notice = null;
  }

  get signupMode(): TSignupMode {
    const config = this.authConfig;
    if (!config) return 'off';
    return config.signupMode ?? (config.selfServiceSignup ? 'open' : 'off');
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
      eventTracker.identify(user.id);
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
    this.loginErrorCode = null;
    this.lastLoginIdentifier = username;
    try {
      const result = await workflowApi.login(username, password);
      setAuthToken(result.accessToken);
      syncI18nLanguage(result.user.language);
      runInAction(() => {
        this.currentUser = result.user;
        this.isLoggingIn = false;
      });
      eventTracker.identify(result.user.id);
      eventTracker.track('login');
    } catch (error) {
      runInAction(() => {
        this.loginError = error instanceof Error ? error.message : 'Login failed';
        this.loginErrorCode = error instanceof ApiCodedError ? error.code : null;
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

  /** `open` mode: creates the account and signs in. `email` is optional. */
  @action async register(username: string, password: string, acceptTerms: boolean, email?: string): Promise<void> {
    this.isLoggingIn = true;
    this.loginError = null;
    try {
      const result = await workflowApi.register({
        username,
        password,
        ...(email ? { email } : {}),
        ...(this.authConfig?.termsUrl ? { acceptTerms } : {}),
      });
      setAuthToken(result.accessToken);
      syncI18nLanguage(result.user.language);
      runInAction(() => {
        this.currentUser = result.user;
        this.isLoggingIn = false;
      });
      eventTracker.identify(result.user.id);
      eventTracker.track('signup');
    } catch (error) {
      runInAction(() => {
        this.loginError = error instanceof Error ? error.message : 'Sign up failed';
        this.isLoggingIn = false;
      });
    }
  }

  /** `application` mode: resolves `true` when the application was accepted (the "check your e-mail" screen is then shown). */
  @action async apply(input: {
    email: string;
    companyName: string;
    automationInterest: string;
    acceptTerms: boolean;
    captchaToken: string;
  }): Promise<boolean> {
    this.isLoggingIn = true;
    this.loginError = null;
    try {
      await workflowApi.apply({ ...input, acceptTerms: this.authConfig?.termsUrl ? input.acceptTerms : true });
      runInAction(() => {
        this.pendingEmail = input.email;
        this.resendState = 'idle';
        this.screen = 'check-email';
        this.isLoggingIn = false;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.loginError = error instanceof Error ? error.message : 'Sign up failed';
        this.isLoggingIn = false;
      });
      return false;
    }
  }

  @action async resendVerification(email: string): Promise<void> {
    this.resendState = 'sending';
    try {
      await workflowApi.resendVerification(email);
    } catch {
      // The endpoint is deliberately uniform (202); a network failure just lets the user retry.
    }
    runInAction(() => {
      this.resendState = 'sent';
    });
  }

  /** Resolves `true` when the (uniform) "if the address exists" answer came back. */
  @action async forgotPassword(email: string, captchaToken = ''): Promise<boolean> {
    this.isLoggingIn = true;
    this.loginError = null;
    try {
      await workflowApi.forgotPassword(email, captchaToken);
      runInAction(() => {
        this.pendingEmail = email;
        this.screen = 'forgot-sent';
        this.isLoggingIn = false;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.loginError = error instanceof Error ? error.message : 'Request failed';
        this.isLoggingIn = false;
      });
      return false;
    }
  }

  @action async resetPassword(password: string): Promise<void> {
    if (!this.resetToken) return;
    this.isLoggingIn = true;
    this.resetError = null;
    try {
      await workflowApi.resetPassword(this.resetToken, password);
      runInAction(() => {
        this.resetToken = null;
        this.notice = 'client:login-page.reset-done';
        this.screen = 'signin';
        this.isLoggingIn = false;
      });
    } catch (error) {
      runInAction(() => {
        this.resetError = error instanceof Error ? error.message : 'Reset failed';
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
    this.screen = 'signin';
  }

  /** Called by a language-switcher UI — persists to the backend and swaps the shared `I18NStore`'s language. */
  @action.bound async setLanguage(language: string): Promise<void> {
    if (this.currentUser?.language === language) return;
    const user = await workflowApi.updateLanguage(language);
    syncI18nLanguage(user.language);
    runInAction(() => {
      this.currentUser = user;
    });
    eventTracker.identify(user.id);
  }
}

export const authStore = new AuthStore();
