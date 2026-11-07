// oxlint-disable unicorn/no-await-expression-member, init-declarations, no-bitwise, unicorn/no-array-sort, no-undefined, no-void
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { getOrCreateSecret, loadOrCreateSecrets } from './secrets.js';

const KEYS = ['JWT_SECRET', 'CREDENTIALS_ENCRYPTION_KEY', 'PROJECT_TOKEN_SECRET', 'WEBHOOK_SECRET_KEY'];

describe('loadOrCreateSecrets', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'falang-secrets-'));
  });

  it('creates secrets.json with mode 0600 and all keys, then returns the same values', async () => {
    const first = await loadOrCreateSecrets(dir);
    expect(first.created).toBe(true);
    expect(Object.keys(first.secrets).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) expect((first.secrets as unknown as Record<string, string>)[key]).toMatch(/^[0-9a-f]{64}$/);
    if (process.platform !== 'win32') expect((await stat(path.join(dir, 'secrets.json'))).mode & 0o777).toBe(0o600);
    const second = await loadOrCreateSecrets(dir);
    expect(second.created).toBe(false);
    expect(second.secrets).toEqual(first.secrets);
  });

  it('reads a complete pre-existing file without rewriting it', async () => {
    const existing = Object.fromEntries(KEYS.map((k) => [k, `v-${k}`]));
    const file = path.join(dir, 'secrets.json');
    await writeFile(file, JSON.stringify(existing));
    const result = await loadOrCreateSecrets(dir);
    expect(result).toEqual({ secrets: existing, created: false });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(existing);
  });

  it('keeps existing keys and fills in missing ones (created stays false)', async () => {
    await writeFile(path.join(dir, 'secrets.json'), JSON.stringify({ JWT_SECRET: 'keep' }));
    const result = await loadOrCreateSecrets(dir);
    expect(result.secrets.JWT_SECRET).toBe('keep');
    expect(result.secrets.WEBHOOK_SECRET_KEY).toMatch(/^[0-9a-f]{64}$/);
    expect(result.created).toBe(false);
    expect(JSON.parse(await readFile(path.join(dir, 'secrets.json'), 'utf8')).WEBHOOK_SECRET_KEY).toBe(
      result.secrets.WEBHOOK_SECRET_KEY,
    );
  });

  it('refuses a corrupt file instead of regenerating secrets (stored credentials would become unreadable)', async () => {
    const file = path.join(dir, 'secrets.json');
    await writeFile(file, '{not json');
    await expect(loadOrCreateSecrets(dir)).rejects.toThrow('is not valid JSON');
    expect(await readFile(file, 'utf8')).toBe('{not json');
    await writeFile(file, '[1]');
    await expect(loadOrCreateSecrets(dir)).rejects.toThrow('must contain a JSON object');
  });
});

describe('getOrCreateSecret', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'falang-secrets-'));
  });

  it('adds a named secret to an existing file without touching the platform secrets', async () => {
    const first = await loadOrCreateSecrets(dir);
    const value = await getOrCreateSecret(dir, 'ACTIVEPIECES_SERVICE_SECRET');
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(await getOrCreateSecret(dir, 'ACTIVEPIECES_SERVICE_SECRET')).toBe(value);
    const stored = JSON.parse(await readFile(path.join(dir, 'secrets.json'), 'utf8'));
    expect(stored).toEqual({ ...first.secrets, ACTIVEPIECES_SERVICE_SECRET: value });
    if (process.platform !== 'win32') expect((await stat(path.join(dir, 'secrets.json'))).mode & 0o777).toBe(0o600);
    // The platform secrets are still read back unchanged, the extra key is not part of them.
    const again = await loadOrCreateSecrets(dir);
    expect(again).toEqual({ secrets: first.secrets, created: false });
  });

  it('keeps service secrets when loadOrCreateSecrets fills in a missing platform key', async () => {
    const file = path.join(dir, 'secrets.json');
    await writeFile(file, JSON.stringify({ JWT_SECRET: 'keep', MEDIA_SECRET: 'service' }));
    const result = await loadOrCreateSecrets(dir);
    expect(result.secrets).not.toHaveProperty('MEDIA_SECRET');
    const stored = JSON.parse(await readFile(file, 'utf8'));
    expect(stored.MEDIA_SECRET).toBe('service');
    expect(stored.JWT_SECRET).toBe('keep');
    expect(await getOrCreateSecret(dir, 'MEDIA_SECRET')).toBe('service');
  });

  it('creates the file when it does not exist yet, and serializes concurrent writers', async () => {
    const values = await Promise.all(['A_SECRET', 'B_SECRET', 'C_SECRET'].map((key) => getOrCreateSecret(dir, key)));
    const stored = JSON.parse(await readFile(path.join(dir, 'secrets.json'), 'utf8'));
    expect([stored.A_SECRET, stored.B_SECRET, stored.C_SECRET]).toEqual(values);
    // `created` (first run) means secrets.json did not exist; in local mode the platform secrets always come first.
    expect((await loadOrCreateSecrets(dir)).created).toBe(false);
  });

  it('rejects an invalid name and a corrupt file', async () => {
    await expect(getOrCreateSecret(dir, 'lower-case')).rejects.toThrow('Invalid secret name');
    await writeFile(path.join(dir, 'secrets.json'), '{oops');
    await expect(getOrCreateSecret(dir, 'X_SECRET')).rejects.toThrow('is not valid JSON');
  });
});
