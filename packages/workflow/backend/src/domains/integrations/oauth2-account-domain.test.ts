import { describe, expect, it } from 'vitest';
import { normalizeOAuth2AccountDomain } from './oauth2-account-domain.js';

const SUFFIXES = ['.amocrm.ru', '.amocrm.com', '.kommo.com'];
const normalize = (raw: string): string => normalizeOAuth2AccountDomain(raw, SUFFIXES);

describe('normalizeOAuth2AccountDomain', () => {
  it('extracts the host from an https URL or a bare host', () => {
    expect(normalize('https://my-account.amocrm.ru')).toBe('my-account.amocrm.ru');
    expect(normalize('https://My-Account.amocrm.ru/')).toBe('my-account.amocrm.ru');
    expect(normalize('my-account.kommo.com')).toBe('my-account.kommo.com');
    expect(normalize('a.b.amocrm.com')).toBe('a.b.amocrm.com');
  });

  it.each([
    'http://my-account.amocrm.ru',
    'https://evil.example',
    'evil.example',
    'https://amocrm.ru.evil.example',
    'https://evilamocrm.ru',
    'amocrm.ru',
    '.amocrm.ru',
    'https://my-account.amocrm.ru:8443',
    'https://user@my-account.amocrm.ru',
    'https://my-account.amocrm.ru@evil.example',
    'https://evil.example/@my-account.amocrm.ru',
    'https://evil.example#.amocrm.ru',
    'https://my-account.amocrm.ru/some/path',
    'https://my-account.amocrm.ru?x=1',
    'ftp://my-account.amocrm.ru',
    '127.0.0.1',
    'https://169.254.169.254',
    'my account.amocrm.ru',
    'a@b.amocrm.ru',
    'b.amocrm.ru:80',
    '',
  ])('rejects %j', (raw) => {
    expect(() => normalize(raw)).toThrow('Invalid account domain');
  });

  it('fails closed when the vendor declares no allowlist', () => {
    expect(() => normalizeOAuth2AccountDomain('my-account.amocrm.ru', [])).toThrow();
  });
});
