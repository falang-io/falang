import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const PART_SEPARATOR = '.';

/**
 * Derives a fixed-length AES-256 key from whatever string an operator sets
 * `CREDENTIALS_ENCRYPTION_KEY` to — a SHA-256 digest is always exactly 32 bytes regardless of the
 * input's length, so this accepts an arbitrary passphrase the same way `JWT_SECRET` does elsewhere
 * in this app, rather than requiring a precisely-formatted base64 key.
 */
export const deriveEncryptionKey = (secret: string): Buffer => createHash('sha256').update(secret).digest();

/** Reads `CREDENTIALS_ENCRYPTION_KEY` and derives its key, or throws a clear error if it's unset — shared by `DocumentsService` (encrypt-on-write) and the internal credential resolver (decrypt-on-read). */
export const requireEncryptionKey = (secret: string | undefined): Buffer => {
  if (!secret) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured');
  return deriveEncryptionKey(secret);
};

/** `iv.authTag.ciphertext`, each base64url — a single opaque string safe to store in a `simple-json` column. */
export const encryptSecret = (plaintext: string, key: Buffer): string => {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString('base64url')).join(PART_SEPARATOR);
};

export const decryptSecret = (encoded: string, key: Buffer): string => {
  const parts = encoded.split(PART_SEPARATOR);
  if (parts.length !== 3) throw new Error('Malformed encrypted credential value');
  const [ivPart, authTagPart, ciphertextPart] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(authTagPart, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextPart, 'base64url')), decipher.final()]);
  return plaintext.toString('utf8');
};
