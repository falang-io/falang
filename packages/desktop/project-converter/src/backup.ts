import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { MANIFEST_FILENAME as NEW_MANIFEST_FILENAME } from '@falang/desktop-project-fs';
import { OLD_MANIFEST_FILENAME } from './detect.js';

/**
 * The old project's own two on-disk entries (`project.falangproject.json` + `falang/`, holding
 * `falang/schemas/**\/*.falang.json` and `falang/config/export.json`) — everything this converter
 * itself reads from or writes into. Note the on-disk *name* `falang/` is shared with the new (v4)
 * layout's own `falang/` directory (`falang/schemes/`, `falang/config/`) — see `paths.ts` in
 * `@falang/desktop-project-fs` — they're never both present at once: `moveOldProjectIntoBackup`
 * empties the old one out of the way before `convertOldProject` creates the new one.
 */
const OLD_FALANG_DIRNAME = 'falang';
const FALANG_OWNED_ENTRIES = [OLD_MANIFEST_FILENAME, OLD_FALANG_DIRNAME];

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Moves only the falang-owned entries of the old-format project at `projectDir` — its manifest
 * (`project.falangproject.json`) and its `falang/` directory — into a fresh `backup/` subfolder.
 * Everything else already sitting in `projectDir` (the user's own `code/`, README, `.git`, images,
 * whatever else) is left exactly where it is at the project root, untouched. Mirrors the old app's
 * own `convert_project_to_latest_version.ts`, which backed up before converting in place —
 * `backup`/`backup2`/`backup3`/... avoids clobbering a previous conversion attempt's backup.
 *
 * Earlier versions of this converter moved the *whole* project directory into `backup/`, which broke
 * any project whose own non-falang files lived alongside the falang project at the same root (a real
 * user project, `example-snake`, has its own `code/ts`/`code/rust`/README/`.git` there) — see
 * ADR 0005 (private)'s "Implementation notes (converter: in-place v2 → v4
 * …)" section.
 *
 * Returns the backup directory's absolute path.
 */
export const moveOldProjectIntoBackup = async (projectDir: string): Promise<string> => {
  let backupDir = path.join(projectDir, 'backup');
  let index = 1;
  // oxlint-disable-next-line no-await-in-loop -- each check depends on the previous one's result (finding the next free name), can't be parallelized
  while (await exists(backupDir)) {
    index += 1;
    backupDir = path.join(projectDir, `backup${index}`);
  }
  await fs.mkdir(backupDir, { recursive: true });

  const entriesPresent = await Promise.all(
    FALANG_OWNED_ENTRIES.map(async (entry) => ((await exists(path.join(projectDir, entry))) ? entry : null)),
  );
  await Promise.all(
    entriesPresent
      .filter((entry): entry is string => entry !== null)
      .map((entry) => fs.rename(path.join(projectDir, entry), path.join(backupDir, entry))),
  );

  return backupDir;
};

/**
 * The inverse of `moveOldProjectIntoBackup` — used by `convertOldProject`'s own rollback when
 * conversion fails partway through (see its module doc): discards whatever partial new-format
 * output `convertOldProject` wrote so far (the new manifest `falang.json` and the new-format
 * `falang/` directory — `falang/schemes/`, `falang/config/` — the only two entries `createProject`/
 * `createDocument`/`createFolder` ever write, see `@falang/desktop-project-fs`'s `project.ts`), then
 * moves `backupDir`'s two falang-owned entries back up to `projectDir`'s root and removes the
 * now-empty `backupDir`. Every non-falang entry at `projectDir`'s root (the user's own `code/`,
 * README, `.git`, …) was never touched by either `moveOldProjectIntoBackup` or a failed conversion
 * attempt, so it's left alone here too — restoring `projectDir` to exactly the old-format project it
 * was before conversion started.
 *
 * The discarded partial output is never anyone's real data — it's new-format artifacts this same
 * failed `convertOldProject` call wrote a moment earlier — so deleting it (rather than preserving it
 * the way `moveOldProjectIntoBackup` preserves the *old* project) is safe.
 */
export const restoreProjectFromBackup = async (projectDir: string, backupDir: string): Promise<void> => {
  await Promise.all([
    fs.rm(path.join(projectDir, NEW_MANIFEST_FILENAME), { force: true }),
    fs.rm(path.join(projectDir, OLD_FALANG_DIRNAME), { recursive: true, force: true }),
  ]);

  const backupEntries = await fs.readdir(backupDir);
  await Promise.all(backupEntries.map((entry) => fs.rename(path.join(backupDir, entry), path.join(projectDir, entry))));
  await fs.rmdir(backupDir);
};
