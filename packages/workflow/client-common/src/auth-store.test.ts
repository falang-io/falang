// oxlint-disable init-declarations, max-lines, no-await-in-loop, no-empty-function, no-promise-executor-return, no-undefined, no-useless-undefined, consistent-function-scoping, numeric-separators-style -- test file: fixture-style helpers and fake-timer plumbing, not production code
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  token: null as string | null,
  setAuthToken: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  api: {
    me: vi.fn(),
    login: vi.fn(),
    authConfig: vi.fn(),
    register: vi.fn(),
    apply: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    updateLanguage: vi.fn(),
  },
  i18n: { language: 'en', setLanguage: vi.fn() },
}));
vi.mock('./api-client.js', () => ({
  getAuthToken: () => h.token,
  setAuthToken: h.setAuthToken,
  setUnauthorizedHandler: h.setUnauthorizedHandler,
  workflowApi: h.api,
}));
vi.mock('@falang/scheme', () => ({ getGlobalI18n: () => h.i18n }));

const { AuthStore } = await import('./auth-store.js');
const { ApiCodedError } = await import('./api-coded-error.js');
const { eventTracker } = await import('./analytics/event-tracker.js');

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  language: 'ru',
  defaultPasswordInUse: true,
  ...over,
});

describe('AuthStore', () => {
  const tracker = { track: vi.fn(), identify: vi.fn() };

  beforeEach(() => {
    vi.unstubAllGlobals();
    h.token = null;
    h.setAuthToken.mockReset();
    h.setUnauthorizedHandler.mockReset();
    for (const fn of Object.values(h.api)) fn.mockReset();
    h.i18n.language = 'en';
    h.i18n.setLanguage.mockReset();
    h.i18n.setLanguage.mockResolvedValue(undefined);
    tracker.track.mockReset();
    tracker.identify.mockReset();
    eventTracker.setHandler(tracker);
  });

  describe('startup', () => {
    it('without a token marks auth as checked and registers the unauthorized handler', async () => {
      const store = new AuthStore();
      await settle();
      expect(store.isAuthChecked).toBe(true);
      expect(store.currentUser).toBeNull();
      expect(h.api.me).not.toHaveBeenCalled();
      expect(h.setUnauthorizedHandler).toHaveBeenCalledTimes(1);
    });

    it('the unauthorized handler logs out', () => {
      const store = new AuthStore();
      store.currentUser = user() as never;
      store.screen = 'forgot';
      h.setUnauthorizedHandler.mock.calls[0][0]();
      expect(store.currentUser).toBeNull();
      expect(store.screen).toBe('signin');
      expect(h.setAuthToken).toHaveBeenCalledWith(null);
    });

    it('with a valid token restores the user, syncs the language and identifies', async () => {
      h.token = 't';
      h.api.me.mockResolvedValue(user());
      const store = new AuthStore();
      await settle();
      expect(store.currentUser).toMatchObject({ id: 'u1' });
      expect(store.isAuthChecked).toBe(true);
      expect(h.i18n.setLanguage).toHaveBeenCalledWith('ru');
      expect(tracker.identify).toHaveBeenCalledWith('u1');
    });

    it('does not re-set an i18n language that is already active', async () => {
      h.token = 't';
      h.i18n.language = 'ru';
      h.api.me.mockResolvedValue(user());
      expect(new AuthStore()).toBeDefined();
      await settle();
      expect(h.i18n.setLanguage).not.toHaveBeenCalled();
    });

    it('with an invalid token drops it', async () => {
      h.token = 'bad';
      h.api.me.mockRejectedValue(new Error('401'));
      const store = new AuthStore();
      await settle();
      expect(h.setAuthToken).toHaveBeenCalledWith(null);
      expect(store.currentUser).toBeNull();
      expect(store.isAuthChecked).toBe(true);
    });

    it('logs (does not throw) when the language sync fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.token = 't';
      h.api.me.mockResolvedValue(user());
      h.i18n.setLanguage.mockRejectedValue(new Error('no bundle'));
      const store = new AuthStore();
      await settle();
      expect(store.currentUser).not.toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('mail links', () => {
    const stubUrl = (search: string) => {
      const replaceState = vi.fn();
      vi.stubGlobal('location', { search, pathname: '/app', hash: '#/x' });
      vi.stubGlobal('history', { replaceState });
      return replaceState;
    };

    it('?resetPassword= opens the reset screen and strips the token from the url', async () => {
      const replaceState = stubUrl('?resetPassword=abc&keep=1');
      const store = new AuthStore();
      await settle();
      expect(store.screen).toBe('reset');
      expect(replaceState).toHaveBeenCalledWith(null, '', '/app?keep=1#/x');
    });

    it('?verifyEmail= verifies right away and ends on the verified screen', async () => {
      const replaceState = stubUrl('?verifyEmail=tok');
      h.api.verifyEmail.mockResolvedValue({ status: 'pending_activation' });
      const store = new AuthStore();
      expect(store.screen).toBe('verifying');
      await settle();
      expect(h.api.verifyEmail).toHaveBeenCalledWith('tok');
      expect(store.verifyResult).toBe('pending_activation');
      expect(store.screen).toBe('verified');
      expect(replaceState).toHaveBeenCalledWith(null, '', '/app#/x');
    });

    it('a rejected verification shows the error result', async () => {
      stubUrl('?verifyEmail=tok');
      h.api.verifyEmail.mockRejectedValue(new Error('expired'));
      const store = new AuthStore();
      await settle();
      expect(store.verifyResult).toBe('error');
      expect(store.screen).toBe('verified');
    });

    it('when already signed in, verification refreshes the user (banner flag)', async () => {
      h.token = 't';
      h.api.me.mockResolvedValue(user({ emailVerified: true }));
      stubUrl('?verifyEmail=tok');
      h.api.verifyEmail.mockResolvedValue({ status: 'active' });
      const store = new AuthStore();
      await settle();
      expect(store.verifyResult).toBe('active');
      expect(h.api.me).toHaveBeenCalledTimes(2);
      expect(store.currentUser).toMatchObject({ emailVerified: true });
    });

    it('an auto-activating confirmation signs in and remembers where the password went', async () => {
      stubUrl('?verifyEmail=tok');
      h.api.verifyEmail.mockResolvedValue({
        status: 'active',
        accessToken: 'new-token',
        user: user({ email: 'boss@acme.test', language: 'en' }),
      });
      const store = new AuthStore();
      await settle();
      expect(h.setAuthToken).toHaveBeenCalledWith('new-token');
      expect(store.currentUser).toMatchObject({ id: 'u1', email: 'boss@acme.test' });
      expect(store.welcomeEmail).toBe('boss@acme.test');
      expect(store.screen).toBe('signin');
      expect(tracker.identify).toHaveBeenCalledWith('u1');
      expect(tracker.track).toHaveBeenCalledWith('signup', undefined);
      store.dismissWelcome();
      expect(store.welcomeEmail).toBeNull();
    });

    it('a failing refresh after verification keeps the verified result', async () => {
      h.token = 't';
      h.api.me.mockResolvedValueOnce(user()).mockRejectedValue(new Error('x'));
      stubUrl('?verifyEmail=tok');
      h.api.verifyEmail.mockResolvedValue({ status: 'active' });
      const store = new AuthStore();
      await settle();
      expect(store.verifyResult).toBe('active');
      expect(store.currentUser).toMatchObject({ id: 'u1' });
    });

    it('a url without tokens is left alone', async () => {
      const replaceState = stubUrl('?foo=1');
      const store = new AuthStore();
      await settle();
      expect(replaceState).not.toHaveBeenCalled();
      expect(store.screen).toBe('signin');
    });

    it('reset token is used by resetPassword and consumed on success', async () => {
      stubUrl('?resetPassword=rt');
      h.api.resetPassword.mockResolvedValue(undefined);
      const store = new AuthStore();
      await store.resetPassword('newpass');
      expect(h.api.resetPassword).toHaveBeenCalledWith('rt', 'newpass');
      expect(store.screen).toBe('signin');
      expect(store.notice).toBe('client:login-page.reset-done');
      // token consumed: a second call does nothing
      await store.resetPassword('again');
      expect(h.api.resetPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('login', () => {
    it('success stores the token, user, language and tracks', async () => {
      h.api.login.mockResolvedValue({ accessToken: 'tok', user: user() });
      const store = new AuthStore();
      await store.login('a', 'b');
      expect(h.setAuthToken).toHaveBeenCalledWith('tok');
      expect(store.currentUser).toMatchObject({ id: 'u1' });
      expect(store.isLoggingIn).toBe(false);
      expect(store.lastLoginIdentifier).toBe('a');
      expect(h.i18n.setLanguage).toHaveBeenCalledWith('ru');
      expect(tracker.identify).toHaveBeenCalledWith('u1');
      expect(tracker.track).toHaveBeenCalledWith('login', undefined);
    });

    it('failure with a coded error exposes the code', async () => {
      h.api.login.mockRejectedValue(new ApiCodedError('Not active', 'not_activated'));
      const store = new AuthStore();
      await store.login('a', 'b');
      expect(store.loginError).toBe('Not active');
      expect(store.loginErrorCode).toBe('not_activated');
      expect(store.currentUser).toBeNull();
      expect(store.isLoggingIn).toBe(false);
    });

    it('failure with a plain error / non-error', async () => {
      const store = new AuthStore();
      h.api.login.mockRejectedValueOnce(new Error('bad creds'));
      await store.login('a', 'b');
      expect(store.loginError).toBe('bad creds');
      expect(store.loginErrorCode).toBeNull();
      h.api.login.mockRejectedValueOnce('x');
      await store.login('a', 'b');
      expect(store.loginError).toBe('Login failed');
    });
  });

  describe('auth config / signup mode', () => {
    it('is off until config loads, then follows signupMode or selfServiceSignup', async () => {
      const store = new AuthStore();
      expect(store.signupMode).toBe('off');
      h.api.authConfig.mockResolvedValueOnce({ selfServiceSignup: true, termsUrl: null });
      await store.loadAuthConfig();
      expect(store.signupMode).toBe('open');
      h.api.authConfig.mockResolvedValueOnce({ selfServiceSignup: true, termsUrl: null, signupMode: 'application' });
      await store.loadAuthConfig();
      expect(store.signupMode).toBe('application');
      h.api.authConfig.mockResolvedValueOnce({ selfServiceSignup: false, termsUrl: null });
      await store.loadAuthConfig();
      expect(store.signupMode).toBe('off');
    });

    it('a failed config fetch keeps the previous state', async () => {
      const store = new AuthStore();
      h.api.authConfig.mockRejectedValue(new Error('old backend'));
      await store.loadAuthConfig();
      expect(store.authConfig).toBeNull();
    });
  });

  describe('register', () => {
    it('sends acceptTerms only when terms exist, includes email, signs in and tracks', async () => {
      h.api.register.mockResolvedValue({ accessToken: 'tok', user: user() });
      const store = new AuthStore();
      await store.register('u', 'p', true);
      expect(h.api.register).toHaveBeenLastCalledWith({ username: 'u', password: 'p' });

      store.authConfig = { selfServiceSignup: true, termsUrl: 'http://t' } as never;
      await store.register('u', 'p', true, 'a@b.c');
      expect(h.api.register).toHaveBeenLastCalledWith({
        username: 'u',
        password: 'p',
        email: 'a@b.c',
        acceptTerms: true,
      });
      expect(store.currentUser).toMatchObject({ id: 'u1' });
      expect(h.setAuthToken).toHaveBeenCalledWith('tok');
      expect(tracker.track).toHaveBeenCalledWith('signup', undefined);
    });

    it('reports a failure', async () => {
      const store = new AuthStore();
      h.api.register.mockRejectedValueOnce(new Error('taken'));
      await store.register('u', 'p', true);
      expect(store.loginError).toBe('taken');
      expect(store.isLoggingIn).toBe(false);
      h.api.register.mockRejectedValueOnce(1);
      await store.register('u', 'p', true);
      expect(store.loginError).toBe('Sign up failed');
    });
  });

  describe('apply (closed beta)', () => {
    const input = {
      email: 'a@b.c',
      companyName: 'C',
      automationInterest: 'x',
      acceptTerms: false,
      captchaToken: 'cap',
    };

    it('success moves to check-email; acceptTerms is forced true when no terms url', async () => {
      h.api.apply.mockResolvedValue(undefined);
      const store = new AuthStore();
      await expect(store.apply(input)).resolves.toBe(true);
      expect(h.api.apply).toHaveBeenLastCalledWith({ ...input, acceptTerms: true });
      expect(store.screen).toBe('check-email');
      expect(store.pendingEmail).toBe('a@b.c');
      expect(store.resendState).toBe('idle');
    });

    it('keeps the user choice when a terms url exists', async () => {
      h.api.apply.mockResolvedValue(undefined);
      const store = new AuthStore();
      store.authConfig = { selfServiceSignup: true, termsUrl: 'http://t' } as never;
      await store.apply(input);
      expect(h.api.apply).toHaveBeenLastCalledWith({ ...input, acceptTerms: false });
    });

    it('failure returns false and keeps the form screen', async () => {
      const store = new AuthStore();
      h.api.apply.mockRejectedValueOnce(new Error('captcha'));
      await expect(store.apply(input)).resolves.toBe(false);
      expect(store.loginError).toBe('captcha');
      expect(store.screen).toBe('signin');
      h.api.apply.mockRejectedValueOnce(null);
      await store.apply(input);
      expect(store.loginError).toBe('Sign up failed');
    });
  });

  describe('resend / forgot / reset', () => {
    it('resendVerification goes sending -> sent, even when the request fails', async () => {
      const store = new AuthStore();
      h.api.resendVerification.mockResolvedValueOnce(undefined);
      const pending = store.resendVerification('a@b.c');
      expect(store.resendState).toBe('sending');
      await pending;
      expect(store.resendState).toBe('sent');
      expect(h.api.resendVerification).toHaveBeenCalledWith('a@b.c');

      store.setScreen('signin');
      expect(store.resendState).toBe('idle');
      h.api.resendVerification.mockRejectedValueOnce(new Error('net'));
      await store.resendVerification('a@b.c');
      expect(store.resendState).toBe('sent');
    });

    it('forgotPassword success shows forgot-sent', async () => {
      h.api.forgotPassword.mockResolvedValue(undefined);
      const store = new AuthStore();
      await expect(store.forgotPassword('a@b.c')).resolves.toBe(true);
      expect(h.api.forgotPassword).toHaveBeenCalledWith('a@b.c', '');
      expect(store.screen).toBe('forgot-sent');
      expect(store.pendingEmail).toBe('a@b.c');
      await store.forgotPassword('a@b.c', 'cap');
      expect(h.api.forgotPassword).toHaveBeenLastCalledWith('a@b.c', 'cap');
    });

    it('forgotPassword failure returns false', async () => {
      const store = new AuthStore();
      h.api.forgotPassword.mockRejectedValueOnce(new Error('captcha'));
      await expect(store.forgotPassword('a@b.c')).resolves.toBe(false);
      expect(store.loginError).toBe('captcha');
      expect(store.screen).toBe('signin');
      h.api.forgotPassword.mockRejectedValueOnce(0);
      await store.forgotPassword('a@b.c');
      expect(store.loginError).toBe('Request failed');
    });

    it('resetPassword without a token does nothing', async () => {
      const store = new AuthStore();
      await store.resetPassword('x');
      expect(h.api.resetPassword).not.toHaveBeenCalled();
    });

    it('resetPassword failure keeps the reset screen with an error and the token for a retry', async () => {
      vi.stubGlobal('location', { search: '?resetPassword=rt', pathname: '/', hash: '' });
      vi.stubGlobal('history', { replaceState: vi.fn() });
      const store = new AuthStore();
      h.api.resetPassword.mockRejectedValueOnce(new Error('expired'));
      await store.resetPassword('p');
      expect(store.resetError).toBe('expired');
      expect(store.screen).toBe('reset');
      expect(store.isLoggingIn).toBe(false);
      h.api.resetPassword.mockRejectedValueOnce('x');
      await store.resetPassword('p');
      expect(store.resetError).toBe('Reset failed');
      h.api.resetPassword.mockResolvedValueOnce(undefined);
      await store.resetPassword('p');
      expect(store.screen).toBe('signin');
    });
  });

  describe('screens, password, logout, language', () => {
    it('setScreen clears errors, and the notice only survives on signin', () => {
      const store = new AuthStore();
      store.loginError = 'e';
      store.loginErrorCode = 'c';
      store.notice = 'n';
      store.setScreen('signin');
      expect(store.loginError).toBeNull();
      expect(store.loginErrorCode).toBeNull();
      expect(store.notice).toBe('n');
      store.setScreen('forgot');
      expect(store.notice).toBeNull();
      expect(store.screen).toBe('forgot');
    });

    it('changePassword stores the fresh token and user; failure propagates', async () => {
      const store = new AuthStore();
      store.currentUser = user() as never;
      h.api.changePassword.mockResolvedValueOnce({
        accessToken: 'fresh',
        user: { ...user(), defaultPasswordInUse: false },
      });
      await store.changePassword('old', 'new');
      expect(h.api.changePassword).toHaveBeenCalledWith('old', 'new');
      expect(h.setAuthToken).toHaveBeenCalledWith('fresh');
      expect((store.currentUser as { defaultPasswordInUse?: boolean } | null)?.defaultPasswordInUse).toBe(false);

      h.api.changePassword.mockRejectedValueOnce(new Error('wrong'));
      await expect(store.changePassword('x', 'y')).rejects.toThrow('wrong');
    });

    it('changePassword modal flag and logout', () => {
      const store = new AuthStore();
      store.currentUser = user() as never;
      store.setChangePasswordOpen(true);
      expect(store.isChangePasswordOpen).toBe(true);
      store.logout();
      expect(store.isChangePasswordOpen).toBe(false);
      expect(store.currentUser).toBeNull();
      expect(h.setAuthToken).toHaveBeenCalledWith(null);
    });

    it('setLanguage persists, swaps the i18n language and identifies; same language is a no-op', async () => {
      const store = new AuthStore();
      store.currentUser = user({ language: 'en' }) as never;
      await store.setLanguage('en');
      expect(h.api.updateLanguage).not.toHaveBeenCalled();
      h.api.updateLanguage.mockResolvedValue(user({ language: 'de' }));
      await store.setLanguage('de');
      expect(h.api.updateLanguage).toHaveBeenCalledWith('de');
      expect(h.i18n.setLanguage).toHaveBeenCalledWith('de');
      expect((store.currentUser as { language?: string } | null)?.language).toBe('de');
      expect(tracker.identify).toHaveBeenCalledWith('u1');
    });
  });
});
