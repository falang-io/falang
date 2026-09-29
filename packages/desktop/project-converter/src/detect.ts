import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { MANIFEST_FILENAME as NEW_MANIFEST_FILENAME } from '@falang/desktop-project-fs';
import type { IOldProjectManifest } from './old-types.js';

export const OLD_MANIFEST_FILENAME = 'project.falangproject.json';
export const OLD_SUPPORTED_VERSION = 2;

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * A project is "old-format" when it has the old app's own manifest filename and lacks the new
 * one — the two eras never share a filename, so this is unambiguous without inspecting contents.
 */
export const isOldFormatProject = async (projectDir: string): Promise<boolean> => {
  const [hasOldManifest, hasNewManifest] = await Promise.all([
    exists(path.join(projectDir, OLD_MANIFEST_FILENAME)),
    exists(path.join(projectDir, NEW_MANIFEST_FILENAME)),
  ]);
  return hasOldManifest && !hasNewManifest;
};

export const readOldManifest = async (projectDir: string): Promise<IOldProjectManifest> => {
  const filePath = path.join(projectDir, OLD_MANIFEST_FILENAME);
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
  if (typeof raw.name !== 'string' || typeof raw.type !== 'string' || typeof raw.version !== 'number')
    throw new Error(`Invalid old project manifest at ${filePath}`);
  if (raw.version !== OLD_SUPPORTED_VERSION)
    throw new Error(
      `Unsupported old project version ${raw.version} at ${filePath} (only version ${OLD_SUPPORTED_VERSION} is supported)`,
    );
  return { name: raw.name, type: raw.type, version: raw.version };
};
