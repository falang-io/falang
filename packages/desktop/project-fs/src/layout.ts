import * as path from 'node:path';
import { FALANG_DIRNAME, SCHEMES_DIRNAME, documentsDir } from './paths.js';
import type { IManifestDocument, IManifestFolder } from './types.js';

/** Just the tree part of a manifest — what path resolution needs (a git blob's manifest has the same shape). */
export interface ILayoutTree {
  folders: readonly IManifestFolder[];
  documents: readonly IManifestDocument[];
}

export const DOCUMENT_EXT = '.json';
const MAX_SEGMENT_LENGTH = 120;
const FORBIDDEN_CHARS = String.raw`\/:*?"<>|`;
// UTF-16 high surrogate range 0xD800–0xDBFF (written in decimal: prettier and oxlint disagree on hex case).
const HIGH_SURROGATE_MIN = 55_296;
const HIGH_SURROGATE_MAX = 56_319;

const replaceForbidden = (value: string): string =>
  Array.from(value, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127 || FORBIDDEN_CHARS.includes(char) ? '_' : char;
  }).join('');
const TRAILING_JUNK = /[\s.]+$/;
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Turns a scheme/folder name into one safe path segment (no extension): forbidden characters become
 * `_`, outer whitespace and trailing dots go, an empty result becomes `untitled`, a leading dot is
 * prefixed with `_`, Windows device names (`CON`, `LPT1`, …, also with an extension) get a `_`, and the
 * length is capped without splitting a surrogate pair. Unicode and inner spaces are kept.
 */
export const sanitizeSegment = (name: string): string => {
  let value = replaceForbidden(name).trim().replace(TRAILING_JUNK, '');
  if (value.length > MAX_SEGMENT_LENGTH) {
    value = value.slice(0, MAX_SEGMENT_LENGTH);
    const last = value.codePointAt(value.length - 1) ?? 0;
    if (last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX) value = value.slice(0, -1);
    value = value.trim().replace(TRAILING_JUNK, '');
  }
  if (value === '') return 'untitled';
  if (value.startsWith('.')) value = `_${value}`;
  const dot = value.indexOf('.');
  const base = (dot === -1 ? value : value.slice(0, dot)).trim();
  if (RESERVED_DEVICE_NAME.test(base)) {
    value = dot === -1 ? `${value}_` : `${value.slice(0, dot)}_${value.slice(dot)}`;
  }
  return value;
};

/** Case-insensitive key of one on-disk name — sibling uniqueness must hold on macOS/Windows file systems too. */
export const nameKey = (onDiskName: string): string => onDiskName.toLowerCase();

/**
 * First of `base`, `base (2)`, `base (3)`, … whose on-disk name (`+ ext`) isn't in `taken` (a set of
 * `nameKey`s). `ext` is `.json` for a document and `''` for a folder, which share one namespace.
 */
export const pickUniqueSegment = (base: string, ext: string, taken: ReadonlySet<string>): string => {
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? base : `${base} (${n})`;
    if (!taken.has(nameKey(candidate + ext))) return candidate;
  }
};

/** On-disk names (as `nameKey`s) already used by the children of `parentId`, optionally ignoring one entry. */
export const takenSegments = (
  tree: ILayoutTree,
  parentId: string | null,
  exclude?: { kind: 'document' | 'folder'; id: string },
): Set<string> => {
  const taken = new Set<string>();
  for (const folder of tree.folders) {
    if (folder.parentId !== parentId || !folder.dirName) continue;
    if (exclude?.kind === 'folder' && exclude.id === folder.id) continue;
    taken.add(nameKey(folder.dirName));
  }
  for (const document of tree.documents) {
    if (document.folderId !== parentId || !document.fileName) continue;
    if (exclude?.kind === 'document' && exclude.id === document.id) continue;
    taken.add(nameKey(document.fileName + DOCUMENT_EXT));
  }
  return taken;
};

/** Computes a unique `fileName` for `entry`'s name inside `folderId` (the entry itself doesn't count as taken). */
export const computeFileName = (
  tree: ILayoutTree,
  entry: { id: string; name: string },
  folderId: string | null,
): string =>
  pickUniqueSegment(
    sanitizeSegment(entry.name),
    DOCUMENT_EXT,
    takenSegments(tree, folderId, { kind: 'document', id: entry.id }),
  );

/** Computes a unique `dirName` for `entry`'s name under `parentId` (the entry itself doesn't count as taken). */
export const computeDirName = (
  tree: ILayoutTree,
  entry: { id: string; name: string },
  parentId: string | null,
): string =>
  pickUniqueSegment(sanitizeSegment(entry.name), '', takenSegments(tree, parentId, { kind: 'folder', id: entry.id }));

/** `dirName`s of `folderId` and its ancestors, outermost first (an unknown/dangling folder id ends the chain, i.e. the document sits at the root). A folder with no stored `dirName` falls back to its sanitized name. */
export const folderDirChain = (tree: ILayoutTree, folderId: string | null): string[] => {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current !== null && !seen.has(current)) {
    const id: string = current;
    seen.add(id);
    const folder = tree.folders.find((entry) => entry.id === id);
    if (!folder) break;
    chain.unshift(folder.dirName ?? sanitizeSegment(folder.name));
    current = folder.parentId;
  }
  return chain;
};

/** Path segments (under `falang/schemes/`) of a document's file; the legacy `<id>.json` when it has no `fileName`. */
export const documentSegments = (tree: ILayoutTree, entry: IManifestDocument): string[] =>
  entry.fileName
    ? [...folderDirChain(tree, entry.folderId), entry.fileName + DOCUMENT_EXT]
    : [`${entry.id}${DOCUMENT_EXT}`];

/** OS path of a document's payload file. */
export const documentFilePath = (projectDir: string, tree: ILayoutTree, entry: IManifestDocument): string =>
  path.join(documentsDir(projectDir), ...documentSegments(tree, entry));

/** POSIX path of a document's file relative to the project dir (for git blobs/staging). */
export const documentRelPosix = (tree: ILayoutTree, entry: IManifestDocument): string =>
  [FALANG_DIRNAME, SCHEMES_DIRNAME, ...documentSegments(tree, entry)].join('/');

/** OS path of a folder's directory. */
export const folderDirPath = (projectDir: string, tree: ILayoutTree, folderId: string): string =>
  path.join(documentsDir(projectDir), ...folderDirChain(tree, folderId));
