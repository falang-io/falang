import { describe, expect, it, vi } from 'vitest';
import { CaptchaUnavailableError } from './captcha-provider.js';
import { SmartCaptchaProvider } from './smartcaptcha.provider.js';

const make = (fetchFn: unknown) => new SmartCaptchaProvider('srv', fetchFn as typeof fetch);

describe('SmartCaptchaProvider', () => {
  it('posts secret/token/ip and accepts status ok', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: 'ok' })));
    await expect(make(fetchFn).verify('tok', '1.2.3.4')).resolves.toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://smartcaptcha.yandexcloud.net/validate');
    const params = new URLSearchParams(init.body);
    expect(params.get('secret')).toBe('srv');
    expect(params.get('token')).toBe('tok');
    expect(params.get('ip')).toBe('1.2.3.4');
  });

  it('omits ip when unknown', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: 'ok' })));
    await make(fetchFn).verify('tok', null);
    const [, init] = fetchFn.mock.calls[0] as [string, { body: string }];
    expect(new URLSearchParams(init.body).has('ip')).toBe(false);
  });

  it('rejects status failed', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: 'failed' })));
    await expect(make(fetchFn).verify('tok', null)).resolves.toBe(false);
  });

  it('treats a non-200 reply as unavailable', async () => {
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(new Response('oops', { status: 502 })));
    await expect(make(fetchFn).verify('tok', null)).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('treats a network error as unavailable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(make(fetchFn).verify('tok', null)).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });
});
