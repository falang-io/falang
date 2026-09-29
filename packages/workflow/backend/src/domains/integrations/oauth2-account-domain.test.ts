import { describe, expect, it } from 'vitest';
import { normalizeOAuth2AccountDomain } from './oauth2-account-domain.js';

describe('normalizeOAuth2AccountDomain', () => {
  it('extracts the host from a full URL with a scheme', () => {
    expect(normalizeOAuth2AccountDomain('https://my-account.amocrm.ru')).toBe('my-account.amocrm.ru');
    expect(normalizeOAuth2AccountDomain('https://my-account.amocrm.ru/')).toBe('my-account.amocrm.ru');
  });

  it('strips a bare scheme prefix and trailing path when URL parsing fails', () => {
    expect(normalizeOAuth2AccountDomain('my-account.amocrm.ru')).toBe('my-account.amocrm.ru');
    expect(normalizeOAuth2AccountDomain('http://my-account.amocrm.ru/some/path')).toBe('my-account.amocrm.ru');
  });
});
