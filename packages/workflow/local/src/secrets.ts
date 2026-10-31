import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ILocalSecrets {
  readonly JWT_SECRET: string;
  /** Encrypts stored credentials: losing this file makes every saved integration credential unreadable. */
  readonly CREDENTIALS_ENCRYPTION_KEY: string;
  readonly PROJECT_TOKEN_SECRET: string;
  readonly WEBHOOK_SECRET_KEY: string;
}

const SECRET_KEYS = ['JWT_SECRET', 'CREDENTIALS_ENCRYPTION_KEY', 'PROJECT_TOKEN_SECRET', 'WEBHOOK_SECRET_KEY'] as const;

/**
 * Loads `<dataDir>/secrets.json` or creates it (mode 0600) with fresh random values. A JSON file, not a `.env`: some
 * tooling refuses `.env*` paths. Back it up together with the data directory.
 */
export const loadOrCreateSecrets = async (dataDir: string): Promise<{ secrets: ILocalSecrets; created: boolean }> => {
  const file = path.join(dataDir, 'secrets.json');
  let existing: Partial<Record<string, string>> = {};
  let text: string | null = null;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    // Only a missing file means "first run"; a permission error or the like must not silently create new secrets.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (text !== null) {
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
    existing = parsed as Partial<Record<string, string>>;
  }
  const created = SECRET_KEYS.some((key) => !existing[key]);
  const merged: Record<string, string> = {};
  for (const key of SECRET_KEYS) merged[key] = existing[key] || randomBytes(32).toString('hex');
  if (created) {
    await writeFile(file, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
    await chmod(file, 0o600).catch(() => null);
  }
  return { secrets: merged as unknown as ILocalSecrets, created: created && text === null };
};
