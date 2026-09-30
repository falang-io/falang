import { CaptchaUnavailableError, type ICaptchaProvider, type TFetch } from './captcha-provider.js';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/** Google reCAPTCHA v2 checkbox. */
export class RecaptchaProvider implements ICaptchaProvider {
  readonly name = 'recaptcha';
  private readonly secret: string;
  private readonly fetchFn: TFetch;

  constructor(secret: string, fetchFn: TFetch) {
    this.secret = secret;
    this.fetchFn = fetchFn;
  }

  async verify(token: string, ip: string | null): Promise<boolean> {
    const form = new URLSearchParams({ secret: this.secret, response: token });
    if (ip) form.set('remoteip', ip);
    const body = await this.fetchFn(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
      .then((response) => response.json() as Promise<{ success?: boolean }>)
      .catch(() => {
        throw new CaptchaUnavailableError('captcha unavailable');
      });
    return body.success === true;
  }
}
