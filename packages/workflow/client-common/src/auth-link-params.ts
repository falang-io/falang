/** Query parameters the mailed links carry: `/?verifyEmail=<token>` and `/?resetPassword=<token>`. */
export interface IAuthLinkParams {
  readonly verifyEmail?: string;
  readonly resetPassword?: string;
}

export const parseAuthLinkParams = (search: string): IAuthLinkParams => {
  const params = new URLSearchParams(search);
  const verifyEmail = params.get('verifyEmail')?.trim();
  const resetPassword = params.get('resetPassword')?.trim();
  return {
    ...(verifyEmail ? { verifyEmail } : {}),
    ...(resetPassword ? { resetPassword } : {}),
  };
};

/** The query string without the two token parameters (leading `?` kept only when something remains). */
export const stripAuthLinkParams = (search: string): string => {
  const params = new URLSearchParams(search);
  params.delete('verifyEmail');
  params.delete('resetPassword');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
};
