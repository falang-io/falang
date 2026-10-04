import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptchaUnavailableError, type ICaptchaProvider, type TFetch } from './captcha-provider.js';
import { RecaptchaProvider } from './recaptcha.provider.js';
import { SmartCaptchaProvider } from './smartcaptcha.provider.js';

export const CAPTCHA_FETCH = Symbol('CAPTCHA_FETCH');

export interface ICaptchaPublicConfig {
  provider: string;
  siteKey: string;
}

/** Provider chosen per call from `CAPTCHA_PROVIDER` (`none` | `recaptcha` | `smartcaptcha`) so env changes follow the live process. */
@Injectable()
export class CaptchaService {
  private readonly config: ConfigService;
  private readonly fetchFn: TFetch;

  constructor(@Inject(ConfigService) config: ConfigService, @Inject(CAPTCHA_FETCH) fetchFn: TFetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  private provider(): ICaptchaProvider | null {
    const name = this.config.get<string>('CAPTCHA_PROVIDER', 'none').trim().toLowerCase();
    if (name === 'recaptcha') return new RecaptchaProvider(this.config.get<string>('CAPTCHA_SECRET', ''), this.fetchFn);
    if (name === 'smartcaptcha') {
      return new SmartCaptchaProvider(this.config.get<string>('CAPTCHA_SECRET', ''), this.fetchFn);
    }
    return null;
  }

  /** What the login page needs to render the widget; `null` when captcha is off. */
  getPublicConfig(): ICaptchaPublicConfig | null {
    const provider = this.provider();
    if (!provider) return null;
    return { provider: provider.name, siteKey: this.config.get<string>('CAPTCHA_SITE_KEY', '') };
  }

  /** Passes silently when the provider is `none`; otherwise 400 on a missing/invalid token, 503 if the vendor is down. */
  async verify(token: string | null, ip: string | null): Promise<void> {
    const provider = this.provider();
    if (!provider) return;
    if (typeof token !== 'string' || token.length === 0) throw new BadRequestException('Captcha token is required');
    const ok = await provider.verify(token, ip).catch((error: unknown) => {
      throw error instanceof CaptchaUnavailableError ? new ServiceUnavailableException('captcha unavailable') : error;
    });
    if (!ok) throw new BadRequestException('Captcha verification failed');
  }
}
