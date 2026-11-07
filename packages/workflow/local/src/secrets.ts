import { randomBytes } from 'node:crypto';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ILocalSecrets {
  readonly JWT_SECRET: string;
  /** Encrypts stored credentials: losing this file makes every saved integration credential unreadable. */
  readonly CREDENTIALS_ENCRYPTION_KEY: string;
  readonly PROJECT_TOKEN_SECRET: string;
  readonly WEBHOOK_SECRET_KEY: string;
}

const SECRET_KEYS = ['JWT_SECRET', 'CREDENTIALS_ENCRYPTION_KEY', 'PROJECT_TOKEN_SECRET', 'WEBHOOK_SECRET_KEY'] as const;

const SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const generateSecret = (): string => randomBytes(32).toString('hex');

const secretsFile = (dataDir: string): string => path.join(dataDir, 'secrets.json');

/** `null` when the file does not exist; throws on anything else that is not a JSON object. */
const readSecretsFile = async (file: string): Promise<Record<string, string> | null> => {
  const text = await readFile(file, 'utf8').catch((error: unknown) => {
    // Only a missing file means "first run"; a permission error or the like must not silently create new secrets.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (text === null) return null;
  // A corrupt file is never regenerated: fresh values would make every stored credential unreadable without a word.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON; fix or remove it before starting`, { cause: error });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON object; fix or remove it before starting`);
  }
  return parsed as Record<string, string>;
};

const writeSecretsFile = async (file: string, secrets: Record<string, string>): Promise<void> => {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => null);
  await rename(tmp, file);
};

/** Serializes read-modify-write of one `secrets.json` within this process. */
const fileLocks = new Map<string, Promise<unknown>>();
const withFileLock = <T>(file: string, fn: () => Promise<T>): Promise<T> => {
  const previous = fileLocks.get(file) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  fileLocks.set(
    file,
    next.catch(() => null),
  );
  return next;
};

/**
 * Loads `<dataDir>/secrets.json` or creates it (mode 0600) with fresh random values. A JSON file, not a `.env`: some
 * tooling refuses `.env*` paths. Back it up together with the data directory. Other keys in the file (the optional
 * services' secrets, see `getOrCreateSecret`) are kept but not returned.
 */
export const loadOrCreateSecrets = (dataDir: string): Promise<{ secrets: ILocalSecrets; created: boolean }> => {
  const file = secretsFile(dataDir);
  return withFileLock(file, async () => {
    const stored = await readSecretsFile(file);
    const existing = stored ?? {};
    const created = SECRET_KEYS.some((key) => !existing[key]);
    const secrets: Record<string, string> = {};
    for (const key of SECRET_KEYS) secrets[key] = existing[key] || generateSecret();
    if (created) await writeSecretsFile(file, { ...existing, ...secrets });
    return { secrets: secrets as unknown as ILocalSecrets, created: created && stored === null };
  });
};

/**
 * One named secret from `<dataDir>/secrets.json`, created (32 random bytes, hex) and persisted on first use — for
 * the optional local services (e.g. `ACTIVEPIECES_SERVICE_SECRET`). The file's other keys are left untouched.
 */
export const getOrCreateSecret = (
  dataDir: string,
  key: string,
  generate: () => string = generateSecret,
): Promise<string> => {
  if (!SECRET_KEY_PATTERN.test(key)) {
    return Promise.reject(new Error(`Invalid secret name "${key}" (expected [A-Z][A-Z0-9_]*)`));
  }
  const file = secretsFile(dataDir);
  return withFileLock(file, async () => {
    const existing = (await readSecretsFile(file)) ?? {};
    const current = existing[key];
    if (typeof current === 'string' && current) return current;
    const value = generate();
    await writeSecretsFile(file, { ...existing, [key]: value });
    return value;
  });
};
