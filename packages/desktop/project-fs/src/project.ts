import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createEmptyManifest, readManifest, writeManifest } from './manifest.js';
import { isV3FormatProject, migrateV3Project } from './migrate-v3.js';
import { configDir, documentsDir, LEGACY_MANIFEST_FILENAME, MANIFEST_FILENAME } from './paths.js';
import type { ICreateProjectParams, IProjectManifest } from './types.js';

/**
 * The old (pre-monorepo) desktop app's own manifest filename — mirrors
 * `@falang/desktop-project-converter`'s `OLD_MANIFEST_FILENAME` (`detect.ts`), duplicated as a
 * literal rather than imported: that package already depends on this one (for `createProject`
 * itself, among other things), so importing back from it here would be circular.
 */
const OLD_FORMAT_MANIFEST_FILENAME = 'project.falangproject.json';

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Creates an empty project at `projectDir` — no documents, no folders. Domain-specific "empty
 * project" content (e.g. a default `contour` document for the `text` project type) is the caller's
 * responsibility to add afterwards via `createDocument`, since `project-fs` has no knowledge of any
 * domain's node shapes.
 *
 * Refuses to overwrite an existing project: throws if `projectDir` already contains a manifest from
 * *any* format this app has ever used (current v4 `falang.json`, v3's `project.json`, or the old
 * pre-monorepo app's `project.falangproject.json`) — a directory otherwise silently reused by
 * `createNewProject` (e.g. a typo'd path the user already created a project in once) would overwrite
 * that project's `falang.json` with a brand-new, empty one, discarding its whole tree with no
 * warning. `projectDir` itself is created if missing (`documentsDir`/`configDir` below would create
 * it too, recursively, but doing it explicitly up front keeps the existence check and the "make the
 * directory" step in the obvious order).
 */
export const createProject = async (projectDir: string, params: ICreateProjectParams): Promise<IProjectManifest> => {
  await fs.mkdir(projectDir, { recursive: true });
  const existingManifestFilenames = [MANIFEST_FILENAME, LEGACY_MANIFEST_FILENAME, OLD_FORMAT_MANIFEST_FILENAME];
  for (const filename of existingManifestFilenames) {
    // oxlint-disable-next-line no-await-in-loop -- three fixed checks, run once per project creation; sequential is simplest
    if (await fileExists(path.join(projectDir, filename))) {
      throw new Error(
        `Cannot create a project at "${projectDir}": a project already exists there (found "${filename}").`,
      );
    }
  }
  await fs.mkdir(documentsDir(projectDir), { recursive: true });
  await fs.mkdir(configDir(projectDir), { recursive: true });
  const manifest = createEmptyManifest(params);
  await writeManifest(projectDir, manifest);
  return manifest;
};

/**
 * Opens an existing project, migrating a v3-format project (`project.json` + `documents/`) to the
 * current v4 layout (`falang.json` + `falang/schemes/`) in place first, if needed — see
 * `migrate-v3.ts`.
 */
export const openProject = async (projectDir: string): Promise<IProjectManifest> => {
  if (await isV3FormatProject(projectDir)) {
    await migrateV3Project(projectDir);
  }
  return readManifest(projectDir);
};
