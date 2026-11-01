/**
 * Query parameters the app reads once at startup: the mailed links' `/?verifyEmail=<token>` and
 * `/?resetPassword=<token>`, and `/?signup=1` — the public site's "try it" buttons, opening the sign-up form.
 */
export interface IAuthLinkParams {
  readonly verifyEmail?: string;
  readonly resetPassword?: string;
  readonly signup?: true;
}

/** `?signup`, `?signup=1`, `?signup=true` open the sign-up form; `0`/`false`/`no` don't. */
const isSignupFlag = (value: string | null): boolean =>
  value !== null && !['0', 'false', 'no'].includes(value.trim().toLowerCase());

export const parseAuthLinkParams = (search: string): IAuthLinkParams => {
  const params = new URLSearchParams(search);
  const verifyEmail = params.get('verifyEmail')?.trim();
  const resetPassword = params.get('resetPassword')?.trim();
  return {
    ...(verifyEmail ? { verifyEmail } : {}),
    ...(resetPassword ? { resetPassword } : {}),
    ...(isSignupFlag(params.get('signup')) ? { signup: true as const } : {}),
  };
};

/** The query string without the parameters above (leading `?` kept only when something remains). */
export const stripAuthLinkParams = (search: string): string => {
  const params = new URLSearchParams(search);
  params.delete('verifyEmail');
  params.delete('resetPassword');
  params.delete('signup');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
};
