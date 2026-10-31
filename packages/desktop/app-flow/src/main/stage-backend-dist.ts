import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stageCopy } from '@falang/desktop-worker-process';

/**
 * Packaged builds: copies `<resources>/backend-dist` to `<dataDir>/backend-dist` once per app build and returns the
 * copy. Needed because the install location is read-only on every platform (AppImage squashfs mount, `/Applications`,
 * `Program Files`) while the backend writes inside its own tree. The stamp is the app version plus the dist's
 * `package.json` mtime, so a rebuilt dist with an unchanged version is still re-staged.
 */
export const stageBackendDist = async (resourcesPath: string, dataDir: string, appVersion: string): Promise<string> => {
  const source = path.join(resourcesPath, 'backend-dist');
  const { mtimeMs } = await fs.stat(path.join(source, 'package.json'));
  return stageCopy({ source, destDir: path.join(dataDir, 'backend-dist'), stamp: `${appVersion}:${mtimeMs}` });
};
