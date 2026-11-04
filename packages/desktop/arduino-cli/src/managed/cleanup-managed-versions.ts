import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** Removes every version directory but `keepVersion`, plus stale `*.tmp-*`/`*.old-*` leftovers. Errors are ignored (a Windows file in use goes at the next start). */
export const cleanupManagedVersions = async (rootDir: string, keepVersion: string | undefined): Promise<void> => {
  const names = await fs.readdir(rootDir).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name !== keepVersion)
      .map((name) => fs.rm(path.join(rootDir, name), { recursive: true, force: true }).catch(() => null)),
  );
};
