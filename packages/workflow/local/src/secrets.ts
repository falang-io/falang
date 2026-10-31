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
  try {
    existing = JSON.parse(await readFile(file, 'utf8')) as Partial<Record<string, string>>;
  } catch {
    existing = {};
  }
  const created = SECRET_KEYS.some((key) => !existing[key]);
  const merged: Record<string, string> = {};
  for (const key of SECRET_KEYS) merged[key] = existing[key] || randomBytes(32).toString('hex');
  if (created) {
    await writeFile(file, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
    await chmod(file, 0o600).catch(() => null);
  }
  return { secrets: merged as unknown as ILocalSecrets, created: created && Object.keys(existing).length === 0 };
};
