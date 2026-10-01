import { describe, expect, it, vi } from 'vitest';
import { findSecretProblems, resolveJwtSecret, validateSecrets } from './validate-secrets.js';

const STRONG = 'k9Zr2pQwXv7LmN4bT8yHc1Ud5Fg3JsAe6';
const good = { JWT_SECRET: STRONG, DB_PASSWORD: `${STRONG}x`, CREDENTIALS_ENCRYPTION_KEY: `${STRONG}y` };

describe('validateSecrets', () => {
  it('accepts strong secrets in production', () => {
    expect(() => validateSecrets({ ...good, NODE_ENV: 'production' })).not.toThrow();
  });

  it.each(['JWT_SECRET', 'DB_PASSWORD', 'CREDENTIALS_ENCRYPTION_KEY'])('rejects a missing %s in production', (name) => {
    const env: Record<string, string> = { ...good, NODE_ENV: 'production', [name]: '' };
    expect(() => validateSecrets(env)).toThrow(new RegExp(`${name} is not set`));
  });

  it.each([
    'dev-secret-change-me',
    'e2e-secret',
    'CHANGE_ME',
    'changeme',
    'admin',
    'secret',
    'dev-encryption-key-change-me',
  ])('rejects the known value %s in production', (value) => {
    expect(() => validateSecrets({ ...good, JWT_SECRET: value, NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a short secret in production', () => {
    expect(() => validateSecrets({ ...good, DB_PASSWORD: 'short-but-unique', NODE_ENV: 'production' })).toThrow(
      /DB_PASSWORD is shorter than 32/,
    );
  });

  it('only warns outside production', () => {
    const warn = vi.fn();
    validateSecrets({ NODE_ENV: 'development' }, warn);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(findSecretProblems({}).problems).toHaveLength(3);
  });
});

describe('resolveJwtSecret', () => {
  it('returns the configured value', () => {
    expect(resolveJwtSecret(STRONG, 'production')).toBe(STRONG);
  });
  it('falls back to a dev value outside production', () => {
    expect(resolveJwtSecret('', 'test')).toBe('dev-secret-change-me');
  });
  it('throws in production without a value', () => {
    expect(() => resolveJwtSecret('', 'production')).toThrow();
  });
});
