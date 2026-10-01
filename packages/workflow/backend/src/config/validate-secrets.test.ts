import { describe, expect, it, vi } from 'vitest';
import {
  findSecretProblems,
  resolveJwtSecret,
  resolveProjectTokenSecret,
  validateSecrets,
} from './validate-secrets.js';

const STRONG = 'k9Zr2pQwXv7LmN4bT8yHc1Ud5Fg3JsAe6';
const good = {
  JWT_SECRET: STRONG,
  DB_PASSWORD: `${STRONG}x`,
  CREDENTIALS_ENCRYPTION_KEY: `${STRONG}y`,
  PROJECT_TOKEN_SECRET: `${STRONG}z`,
};

describe('validateSecrets', () => {
  it('accepts strong secrets in production', () => {
    expect(() => validateSecrets({ ...good, NODE_ENV: 'production' })).not.toThrow();
  });

  it.each(['JWT_SECRET', 'DB_PASSWORD', 'CREDENTIALS_ENCRYPTION_KEY', 'PROJECT_TOKEN_SECRET'])(
    'rejects a missing %s in production',
    (name) => {
      const env: Record<string, string> = { ...good, NODE_ENV: 'production', [name]: '' };
      expect(() => validateSecrets(env)).toThrow(new RegExp(`${name} is not set`));
    },
  );

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
    expect(warn).toHaveBeenCalledTimes(4);
    expect(findSecretProblems({}).problems).toHaveLength(4);
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

describe('resolveProjectTokenSecret', () => {
  it('returns the configured value', () => {
    expect(resolveProjectTokenSecret(STRONG, 'production')).toBe(STRONG);
  });
  it('falls back to a dev value outside production', () => {
    expect(resolveProjectTokenSecret('', 'test')).toBe('dev-project-token-secret-change-me');
  });
  it('throws in production without a value', () => {
    expect(() => resolveProjectTokenSecret('', 'production')).toThrow(/PROJECT_TOKEN_SECRET/);
  });
  it('is rejected as a known dev value in production by validateSecrets', () => {
    expect(() =>
      validateSecrets({ ...good, PROJECT_TOKEN_SECRET: 'dev-project-token-secret-change-me', NODE_ENV: 'production' }),
    ).toThrow(/PROJECT_TOKEN_SECRET is a known development/);
  });
});
