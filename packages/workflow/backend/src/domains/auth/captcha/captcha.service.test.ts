import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { CaptchaService } from './captcha.service.js';

const make = (env: Record<string, string>, fetchFn: typeof fetch) =>
  new CaptchaService(new ConfigService(env), fetchFn);
const jsonResponse = (body: unknown) => Promise.resolve(Response.json(body));

describe('CaptchaService', () => {
  it('always passes with provider none and reports no public config', async () => {
    const fetchFn = vi.fn();
    const service = make({}, fetchFn as unknown as typeof fetch);
    await expect(service.verify(null, null)).resolves.toBeUndefined();
    expect(service.getPublicConfig()).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('posts secret/response/remoteip to siteverify and passes on success', async () => {
    const fetchFn = vi.fn().mockImplementation(() => jsonResponse({ success: true }));
    const service = make(
      { CAPTCHA_PROVIDER: 'recaptcha', CAPTCHA_SECRET: 's3cret', CAPTCHA_SITE_KEY: 'site' },
      fetchFn as unknown as typeof fetch,
    );
    expect(service.getPublicConfig()).toEqual({ provider: 'recaptcha', siteKey: 'site' });
    await service.verify('tok', '1.2.3.4');
    const [url, init] = fetchFn.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://www.google.com/recaptcha/api/siteverify');
    const params = new URLSearchParams(init.body);
    expect(params.get('secret')).toBe('s3cret');
    expect(params.get('response')).toBe('tok');
    expect(params.get('remoteip')).toBe('1.2.3.4');
  });

  it('rejects success:false and a missing token with 400', async () => {
    const fetchFn = vi.fn().mockImplementation(() => jsonResponse({ success: false }));
    const service = make({ CAPTCHA_PROVIDER: 'recaptcha', CAPTCHA_SECRET: 'x' }, fetchFn as unknown as typeof fetch);
    await expect(service.verify('tok', null)).rejects.toMatchObject({ status: 400 });
    await expect(service.verify(null, null)).rejects.toMatchObject({ status: 400 });
  });

  it('turns a network error into 503, never a pass', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
    const service = make({ CAPTCHA_PROVIDER: 'recaptcha', CAPTCHA_SECRET: 'x' }, fetchFn as unknown as typeof fetch);
    await expect(service.verify('tok', null)).rejects.toMatchObject({ status: 503 });
  });

  it('selects Yandex SmartCaptcha and reports its public config', async () => {
    const fetchFn = vi.fn().mockImplementation(() => jsonResponse({ status: 'ok' }));
    const service = make(
      { CAPTCHA_PROVIDER: 'smartcaptcha', CAPTCHA_SECRET: 'srv', CAPTCHA_SITE_KEY: 'cli' },
      fetchFn as unknown as typeof fetch,
    );
    expect(service.getPublicConfig()).toEqual({ provider: 'smartcaptcha', siteKey: 'cli' });
    await service.verify('tok', '1.2.3.4');
    expect((fetchFn.mock.calls[0] as [string])[0]).toBe('https://smartcaptcha.cloud.yandex.ru/validate');
  });

  it('maps a SmartCaptcha outage to 503 and a failed check to 400', async () => {
    const env = { CAPTCHA_PROVIDER: 'smartcaptcha', CAPTCHA_SECRET: 'x' };
    const down = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 500 })));
    await expect(make(env, down as unknown as typeof fetch).verify('tok', null)).rejects.toMatchObject({ status: 503 });
    const failed = vi.fn().mockImplementation(() => jsonResponse({ status: 'failed' }));
    await expect(make(env, failed as unknown as typeof fetch).verify('tok', null)).rejects.toMatchObject({
      status: 400,
    });
  });
});
