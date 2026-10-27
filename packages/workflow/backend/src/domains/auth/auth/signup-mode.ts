import type { ConfigService } from '@nestjs/config';

export type TSignupMode = 'off' | 'open' | 'application';

/**
 * `SIGNUP_MODE` wins when it is a valid value; otherwise the legacy `SELF_SERVICE_SIGNUP=true` reads as `open`.
 * Read per request so the flag follows the live environment.
 */
/** The same rule over a plain env map (startup validation runs before any `ConfigService` exists). */
export const resolveSignupModeFromEnv = (env: Record<string, string | undefined>): TSignupMode => {
  const raw = (env.SIGNUP_MODE ?? '').trim().toLowerCase();
  if (raw === 'off' || raw === 'open' || raw === 'application') return raw;
  return (env.SELF_SERVICE_SIGNUP ?? 'false') === 'true' ? 'open' : 'off';
};

export const resolveSignupMode = (config: ConfigService): TSignupMode =>
  resolveSignupModeFromEnv({
    SIGNUP_MODE: config.get<string>('SIGNUP_MODE', ''),
    SELF_SERVICE_SIGNUP: config.get<string>('SELF_SERVICE_SIGNUP', 'false'),
  });

/**
 * `SIGNUP_AUTO_ACTIVATE=true` (meaningful in `application` mode): confirming the e-mail activates the account at once,
 * signs the user in and mails the generated password — no admin review. Off by default (a closed beta's manual activation).
 */
export const resolveSignupAutoActivate = (config: ConfigService): boolean =>
  config.get<string>('SIGNUP_AUTO_ACTIVATE', 'false').trim().toLowerCase() === 'true';
