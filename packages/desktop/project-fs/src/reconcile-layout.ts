import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  DOCUMENT_EXT,
  computeDirName,
  computeFileName,
  documentFilePath,
  folderDirPath,
  nameKey,
  pickUniqueSegment,
  takenSegments,
} from './layout.js';
import { readManifest, writeManifest } from './manifest.js';
import { documentsDir, legacyDocumentPath } from './paths.js';
import { withProjectLock } from './project-lock.js';
import { FORMAT_VERSION, type IProjectManifest } from './types.js';

const pathExists = async (candidate: string): Promise<boolean> => {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
};

/** Renames `from` to `to` (creating `to`'s parent dirs); a case-only change goes through a temp name so it works on case-insensitive file systems. */
export const movePath = async (from: string, to: string): Promise<void> => {
  if (from === to) return;
  await fs.mkdir(path.dirname(to), { recursive: true });
  if (from.toLowerCase() === to.toLowerCase()) {
    const temp = `${from}.falang-tmp-${process.pid}-${Date.now()}`;
    await fs.rename(from, temp);
    await fs.rename(temp, to);
    return;
  }
  await fs.rename(from, to);
};

/**
 * Removes empty directories under `falang/schemes/` that don't correspond to a manifest folder
 * (never `falang/schemes/` itself, never a directory a manifest folder maps to).
 */
export const pruneEmptyDirs = async (projectDir: string, manifest: IProjectManifest): Promise<void> => {
  const root = documentsDir(projectDir);
  const expected = new Set(manifest.folders.map((folder) => nameKey(folderDirPath(projectDir, manifest, folder.id))));
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      // oxlint-disable-next-line no-await-in-loop -- depth-first walk, tiny trees
      await walk(child);
      if (expected.has(nameKey(child))) continue;
      // oxlint-disable-next-line no-await-in-loop
      const rest = await fs.readdir(child).catch(() => ['x']);
      // oxlint-disable-next-line no-await-in-loop
      if (rest.length === 0) await fs.rmdir(child).catch(() => null);
    }
  };
  await walk(root);
};

/** `true` iff the manifest still needs `reconcileProjectLayout` (older version, or an entry without its on-disk segment). */
export const manifestNeedsReconcile = (manifest: IProjectManifest): boolean =>
  manifest.formatVersion < FORMAT_VERSION ||
  manifest.folders.some((folder) => !folder.dirName) ||
  manifest.documents.some((doc) => !doc.fileName);

const listJsonFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listJsonFiles(full);
      return Promise.resolve(entry.isFile() && entry.name.endsWith(DOCUMENT_EXT) ? [full] : []);
    }),
  );
  return nested.flat();
};

const readJsonId = async (filePath: string): Promise<string | null> => {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as { id?: unknown };
    return typeof raw.id === 'string' ? raw.id : null;
  } catch {
    return null;
  }
};

/** Gives every folder/document its stored `dirName`/`fileName` (parents first, manifest order). Returns whether anything was assigned. */
const assignLayoutNames = (manifest: IProjectManifest): boolean => {
  let changed = false;
  const done = new Set<string>();
  const assignFolder = (folderId: string, guard: Set<string>): void => {
    if (done.has(folderId) || guard.has(folderId)) return;
    guard.add(folderId);
    const folder = manifest.folders.find((entry) => entry.id === folderId);
    if (!folder) return;
    if (folder.parentId !== null) assignFolder(folder.parentId, guard);
    if (!folder.dirName) {
      folder.dirName = computeDirName(manifest, folder, folder.parentId);
      changed = true;
    }
    done.add(folderId);
  };
  for (const folder of manifest.folders) assignFolder(folder.id, new Set());

  for (const doc of manifest.documents) {
    if (doc.fileName) continue;
    doc.fileName = computeFileName(manifest, doc, doc.folderId);
    changed = true;
  }
  return changed;
};

/**
 * Moves every document file that isn't at its expected path there — via temp names, so one file's
 * target being another one's legacy source can't clobber anything. `legacyOwners` maps the legacy
 * `<id>.json` paths of documents that had no `fileName` yet to their ids. Returns whether a
 * `fileName` had to change (an unknown, unindexed file already sat at the target).
 */
const moveMisplacedFiles = async (
  projectDir: string,
  manifest: IProjectManifest,
  legacyOwners: ReadonlyMap<string, string>,
): Promise<boolean> => {
  let changed = false;
  const isForeignLegacyFile = (filePath: string, docId: string): boolean => {
    const owner = legacyOwners.get(nameKey(filePath));
    return Boolean(owner) && owner !== docId;
  };

  const moves: { id: string; from: string; temp: string }[] = [];
  let scanned: Map<string, string> | null = null;
  const expectedPaths = new Set(manifest.documents.map((doc) => nameKey(documentFilePath(projectDir, manifest, doc))));
  const scan = async (): Promise<Map<string, string>> => {
    if (scanned) return scanned;
    const found = new Map<string, string>();
    for (const file of await listJsonFiles(documentsDir(projectDir))) {
      if (expectedPaths.has(nameKey(file))) continue;
      // oxlint-disable-next-line no-await-in-loop
      const id = await readJsonId(file);
      if (id !== null && !found.has(id)) found.set(id, file);
    }
    scanned = found;
    return found;
  };
  for (const doc of manifest.documents) {
    const expected = documentFilePath(projectDir, manifest, doc);
    // oxlint-disable-next-line no-await-in-loop
    if ((await pathExists(expected)) && !isForeignLegacyFile(expected, doc.id)) continue;
    const legacy = legacyDocumentPath(projectDir, doc.id);
    // oxlint-disable-next-line no-await-in-loop
    const legacyExists = await pathExists(legacy);
    // oxlint-disable-next-line no-await-in-loop
    const found = legacyExists ? null : await scan();
    const source = legacyExists ? legacy : (found?.get(doc.id) ?? null);
    if (source === null) continue;
    moves.push({ id: doc.id, from: source, temp: `${source}.falang-tmp-${moves.length}` });
  }
  for (const move of moves) {
    // oxlint-disable-next-line no-await-in-loop
    await fs.rename(move.from, move.temp);
  }
  for (const move of moves) {
    const doc = manifest.documents.find((entry) => entry.id === move.id);
    if (!doc) continue;
    let target = documentFilePath(projectDir, manifest, doc);
    // An unknown, unindexed file may already sit at the target — pick another name instead of overwriting it.
    // oxlint-disable-next-line no-await-in-loop
    while (await pathExists(target)) {
      const taken = takenSegments(manifest, doc.folderId, { kind: 'document', id: doc.id });
      taken.add(nameKey((doc.fileName ?? '') + DOCUMENT_EXT));
      doc.fileName = pickUniqueSegment(doc.fileName ?? doc.id, DOCUMENT_EXT, taken);
      changed = true;
      target = documentFilePath(projectDir, manifest, doc);
    }
    // oxlint-disable-next-line no-await-in-loop
    await movePath(move.temp, target);
  }
  return changed;
};

/**
 * v4 → v5 migration plus self-healing, idempotent: gives every folder/document its stored
 * `dirName`/`fileName` (parents before children, manifest order), moves each document file that isn't
 * at its expected path there (looked up first as the legacy `falang/schemes/<id>.json`, otherwise by
 * scanning `falang/schemes/` for a `.json` whose `id` matches), makes sure every folder's directory
 * exists, prunes empty stray directories, and sets `formatVersion` to 5 — writing the manifest only if
 * something changed. Unknown extra `.json` files are left alone (just not indexed). Returns the
 * (possibly updated) manifest.
 */
export const reconcileProjectLayoutUnlocked = async (projectDir: string): Promise<IProjectManifest> => {
  const manifest = await readManifest(projectDir);

  // A legacy `<id>.json` file sitting at another document's expected path is not that document's file.
  const legacyOwners = new Map<string, string>();
  for (const doc of manifest.documents) {
    if (!doc.fileName) legacyOwners.set(nameKey(legacyDocumentPath(projectDir, doc.id)), doc.id);
  }

  let changed = assignLayoutNames(manifest);
  if (await moveMisplacedFiles(projectDir, manifest, legacyOwners)) changed = true;

  await fs.mkdir(documentsDir(projectDir), { recursive: true });
  for (const folder of manifest.folders) {
    // oxlint-disable-next-line no-await-in-loop
    await fs.mkdir(folderDirPath(projectDir, manifest, folder.id), { recursive: true });
  }
  await pruneEmptyDirs(projectDir, manifest);

  if (manifest.formatVersion !== FORMAT_VERSION) {
    manifest.formatVersion = FORMAT_VERSION;
    changed = true;
  }
  if (changed) await writeManifest(projectDir, manifest);
  return manifest;
};

/** `reconcileProjectLayoutUnlocked` under the project's serial lock (see `project-lock.ts`) — the exported entry point. */
export const reconcileProjectLayout = (projectDir: string): Promise<IProjectManifest> =>
  withProjectLock(projectDir, () => reconcileProjectLayoutUnlocked(projectDir));

/**
 * Reads the manifest, running the reconcile first when it predates v5 or lacks on-disk segments.
 * Must itself be called under `withProjectLock` (it is an internal building block of the locked operations).
 */
export const readLayoutManifest = async (projectDir: string): Promise<IProjectManifest> => {
  const manifest = await readManifest(projectDir);
  return manifestNeedsReconcile(manifest) ? reconcileProjectLayoutUnlocked(projectDir) : manifest;
};
