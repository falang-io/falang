import { CaptchaUnavailableError, type ICaptchaProvider, type TFetch } from './captcha-provider.js';

const VALIDATE_URL = 'https://smartcaptcha.cloud.yandex.ru/validate';

/**
 * Yandex SmartCaptcha. A non-200 reply is a vendor problem, not a failed check — but deliberately NOT a pass, although
 * Yandex's docs suggest treating it as `ok`: a wrong server key also answers non-200 (403 "Invalid secret"), and failing
 * open would silently switch the captcha off on a misconfigured deployment.
 */
export class SmartCaptchaProvider implements ICaptchaProvider {
  readonly name = 'smartcaptcha';
  private readonly secret: string;
  private readonly fetchFn: TFetch;

  constructor(secret: string, fetchFn: TFetch) {
    this.secret = secret;
    this.fetchFn = fetchFn;
  }

  async verify(token: string, ip: string | null): Promise<boolean> {
    const form = new URLSearchParams({ secret: this.secret, token });
    if (ip) form.set('ip', ip);
    const body = await this.fetchFn(VALIDATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
      .then((response) => {
        if (response.status !== 200) throw new Error(`status ${response.status}`);
        return response.json() as Promise<{ status?: string }>;
      })
      .catch(() => {
        throw new CaptchaUnavailableError('captcha unavailable');
      });
    return body.status === 'ok';
  }
}
