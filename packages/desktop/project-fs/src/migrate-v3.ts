import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { documentsDir, falangDir, legacyDocumentsDir, legacyManifestPath, manifestPath } from './paths.js';
import { FORMAT_VERSION } from './types.js';

const pathExists = async (candidate: string): Promise<boolean> => {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
};

/**
 * `true` iff `projectDir` is a v3-format project (`project.json` manifest, `documents/<id>.json`)
 * that hasn't been migrated to v4 (`falang.json` + `falang/schemes/`) yet — the two eras never share
 * a manifest filename, so this is unambiguous without inspecting contents. `openProject` calls this
 * itself; exported so a host (or a test) can check/migrate explicitly too.
 */
export const isV3FormatProject = async (projectDir: string): Promise<boolean> => {
  const [hasLegacyManifest, hasNewManifest] = await Promise.all([
    pathExists(legacyManifestPath(projectDir)),
    pathExists(manifestPath(projectDir)),
  ]);
  return hasLegacyManifest && !hasNewManifest;
};

/**
 * In-place v3 → v4 migration (ADR 0005 (private)'s "Implementation notes
 * (on-disk layout v4 …)"): moves every `documents/<id>.json` file to `falang/schemes/<id>.json`,
 * removes the now-empty `documents/` dir, rewrites the manifest as `falang.json` with
 * `formatVersion: 4` (every other field carried over verbatim, not re-validated — a broken v3
 * manifest stays broken, just renamed, so `openProject`'s own `readManifest` validation still
 * reports it the same way it would have before this migration existed), and deletes the old
 * `project.json`. Callers should check `isV3FormatProject` first; this function doesn't re-check.
 */
export const migrateV3Project = async (projectDir: string): Promise<void> => {
  const legacyDocsDir = legacyDocumentsDir(projectDir);
  const newDocsDir = documentsDir(projectDir);
  await fs.mkdir(falangDir(projectDir), { recursive: true });
  await fs.mkdir(newDocsDir, { recursive: true });

  const legacyDocEntries = await fs.readdir(legacyDocsDir).catch(() => [] as string[]);
  await Promise.all(
    legacyDocEntries
      .filter((fileName) => fileName.endsWith('.json'))
      .map((fileName) => fs.rename(path.join(legacyDocsDir, fileName), path.join(newDocsDir, fileName))),
  );
  await fs.rm(legacyDocsDir, { recursive: true, force: true });

  const rawManifest = JSON.parse(await fs.readFile(legacyManifestPath(projectDir), 'utf8')) as Record<string, unknown>;
  rawManifest.formatVersion = FORMAT_VERSION;
  await fs.writeFile(manifestPath(projectDir), JSON.stringify(rawManifest, null, 2));
  await fs.rm(legacyManifestPath(projectDir), { force: true });
};
