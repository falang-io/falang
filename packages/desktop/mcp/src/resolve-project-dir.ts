import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { MANIFEST_FILENAME } from '@falang/desktop-project-fs';

const hasManifest = async (dir: string): Promise<boolean> => {
  try {
    await fs.access(path.join(dir, MANIFEST_FILENAME));
    return true;
  } catch {
    return false;
  }
};

/**
 * `argv[2]` (the CLI's own project-dir argument, per ADR 0029 (private)'s phase E task
 * description — default cwd) is walked up from until a directory containing `falang.json` is
 * found, so `claude` started from a subfolder of a project (or from the project root itself) still
 * finds it. Throws if no ancestor has one, all the way to the filesystem root.
 */
export const resolveProjectDir = async (startDir: string): Promise<string> => {
  let dir = path.resolve(startDir);
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- one exists() check per ancestor directory, sequential by construction (each iteration needs the previous one's negative result to know whether to keep walking up).
    if (await hasManifest(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No falang project found: no "${MANIFEST_FILENAME}" in "${startDir}" or any parent directory`);
    }
    dir = parent;
  }
};
