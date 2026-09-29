import { describe, expect, it } from 'vitest';
import { decryptSecret, deriveEncryptionKey, encryptSecret } from './credentials-crypto.js';

describe('credentials-crypto', () => {
  it('round-trips a plaintext value through encryptSecret/decryptSecret', () => {
    const key = deriveEncryptionKey('dev-secret-change-me');

    const encrypted = encryptSecret('123456:ABC-DEF-real-bot-token', key);

    expect(encrypted).not.toContain('123456:ABC-DEF-real-bot-token');
    expect(decryptSecret(encrypted, key)).toBe('123456:ABC-DEF-real-bot-token');
  });

  it('produces a different ciphertext each time (random IV) even for the same plaintext/key', () => {
    const key = deriveEncryptionKey('dev-secret-change-me');

    const first = encryptSecret('same-value', key);
    const second = encryptSecret('same-value', key);

    expect(first).not.toBe(second);
    expect(decryptSecret(first, key)).toBe('same-value');
    expect(decryptSecret(second, key)).toBe('same-value');
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptSecret('secret-value', deriveEncryptionKey('key-a'));

    expect(() => decryptSecret(encrypted, deriveEncryptionKey('key-b'))).toThrow();
  });

  it('deriveEncryptionKey is deterministic for the same input secret', () => {
    expect(deriveEncryptionKey('same-passphrase')).toEqual(deriveEncryptionKey('same-passphrase'));
  });

  it('rejects a malformed encoded value', () => {
    const key = deriveEncryptionKey('dev-secret-change-me');
    expect(() => decryptSecret('not-a-valid-encoded-value', key)).toThrow(/Malformed/);
  });
});
