import type { ConfigService } from '@nestjs/config';

export type TSignupMode = 'off' | 'open' | 'application';

/**
 * `SIGNUP_MODE` wins when it is a valid value; otherwise the legacy `SELF_SERVICE_SIGNUP=true` reads as `open`.
 * Read per request so the flag follows the live environment.
 */
export const resolveSignupMode = (config: ConfigService): TSignupMode => {
  const raw = config.get<string>('SIGNUP_MODE', '').trim().toLowerCase();
  if (raw === 'off' || raw === 'open' || raw === 'application') return raw;
  return config.get<string>('SELF_SERVICE_SIGNUP', 'false') === 'true' ? 'open' : 'off';
};

/**
 * `SIGNUP_AUTO_ACTIVATE=true` (meaningful in `application` mode): confirming the e-mail activates the account at once,
 * signs the user in and mails the generated password — no admin review. Off by default (a closed beta's manual activation).
 */
export const resolveSignupAutoActivate = (config: ConfigService): boolean =>
  config.get<string>('SIGNUP_AUTO_ACTIVATE', 'false').trim().toLowerCase() === 'true';
