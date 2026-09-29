import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * Generic per-project JSON sidecar file, written next to `falang.json` — `<projectDir>/<name>.json`
 * (sidecars stay at the project root even after the v4 layout moved the manifest/documents under
 * `falang/`, see ADR 0005 (private)'s "Implementation notes (on-disk
 * layout v4 …)"). `project-fs` has no knowledge of what a sidecar holds; a caller (e.g. the Arduino
 * app's debug breakpoints, ADR 0021 (private) §3 — "session store, host-saved... a
 * `.falang-debug.json` sidecar next to `project.json` for desktop apps") picks its own `name` and
 * shape. Best-effort on read: a missing or corrupt file returns `null` rather than throwing, so a
 * caller can treat "never saved" and "not readable" the same way a fresh project would be.
 */
export const readSidecar = async <T>(projectDir: string, name: string): Promise<T | null> => {
  try {
    const raw = await fs.readFile(path.join(projectDir, `${name}.json`), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const writeSidecar = async <T>(projectDir: string, name: string, data: T): Promise<void> => {
  await fs.writeFile(path.join(projectDir, `${name}.json`), JSON.stringify(data, null, 2));
};
