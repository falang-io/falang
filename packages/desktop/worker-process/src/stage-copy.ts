import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const STAMP_FILENAME = '.falang-stage-stamp';

export interface IStageCopyParams {
  /** File or directory to copy. */
  readonly source: string;
  /** Directory the copy lands in (for a file source, the file keeps its own name inside it). */
  readonly destDir: string;
  /** Identifies the source's contents, e.g. the app version — the copy is redone only when it changes. */
  readonly stamp: string;
}

const readStamp = async (destDir: string): Promise<string | null> => {
  try {
    return await fs.readFile(path.join(destDir, STAMP_FILENAME), 'utf8');
  } catch {
    return null;
  }
};

/**
 * Keeps a copy of `source` in `destDir`, redone whenever `stamp` changes, and returns `destDir`.
 *
 * Exists for Linux AppImages: everything under `process.resourcesPath` lives in the image's
 * temporary mount (`/tmp/.mount_*`), which disappears when the app quits, so a path written into a
 * project's `.mcp.json` must point at a stable copy instead (ADR 0050 (private), "B1"). The copy is
 * assembled in a sibling temp directory and swapped in with a rename, so a concurrent reader never
 * sees a half-written tree.
 */
export const stageCopy = async ({ source, destDir, stamp }: IStageCopyParams): Promise<string> => {
  if ((await readStamp(destDir)) === stamp) return destDir;
  const tempDir = `${destDir}.tmp-${process.pid}-${Date.now()}`;
  await fs.rm(tempDir, { recursive: true, force: true });
  const sourceStat = await fs.stat(source);
  if (sourceStat.isDirectory()) {
    await fs.cp(source, tempDir, { recursive: true });
  } else {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.copyFile(source, path.join(tempDir, path.basename(source)));
  }
  await fs.writeFile(path.join(tempDir, STAMP_FILENAME), stamp);
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destDir), { recursive: true });
  await fs.rename(tempDir, destDir);
  return destDir;
};
