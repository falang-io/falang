import type { IProjectTreeFolder } from '@falang/dto';

/** Kinds of the fixed section folders at the root of a workflow project (ADR 0055 (private)). */
export type TWorkflowFixedFolderKind = 'triggers' | 'functions' | 'types';

/** One fixed root section: which document types it accepts. A type belongs to at most one section. */
export interface IFixedFolderConfig {
  readonly kind: string;
  /** Canonical (English) stored folder name; the UI shows a localised label by `kind`. */
  readonly name: string;
  readonly documentTypes: readonly string[];
}

/** Config order is the display order of the sections at the root (after the pinned `Integrations` document). */
export const WORKFLOW_FIXED_FOLDERS = [
  { kind: 'triggers', name: 'Triggers', documentTypes: ['trigger-function'] },
  { kind: 'functions', name: 'Functions', documentTypes: ['function'] },
  { kind: 'types', name: 'Types', documentTypes: ['objects-structure'] },
] as const satisfies readonly IFixedFolderConfig[];

export const WORKFLOW_FIXED_FOLDER_KINDS: readonly TWorkflowFixedFolderKind[] = WORKFLOW_FIXED_FOLDERS.map(
  (section) => section.kind,
);

export interface ILayoutDocument {
  id: string;
  type: string;
  folderId: string | null;
  pinned?: boolean;
}

type TConfig = readonly IFixedFolderConfig[];

export const isFixedFolder = (folder: Pick<IProjectTreeFolder, 'fixedKind'> | null | undefined): boolean =>
  typeof folder?.fixedKind === 'string' && folder.fixedKind !== '';

const configOf = (kind: string, config: TConfig): IFixedFolderConfig | undefined =>
  config.find((section) => section.kind === kind);

/** The section (kind) accepting documents of `type`, or `null` (e.g. `integrations`, which stays at the root). */
export const sectionForDocumentType = (type: string, config: TConfig = WORKFLOW_FIXED_FOLDERS): string | null =>
  config.find((section) => section.documentTypes.includes(type))?.kind ?? null;

/** The section folder of `kind` (a root folder carrying that `fixedKind`), or `null` when the project has none. */
export const findSectionFolder = (kind: string, folders: readonly IProjectTreeFolder[]): IProjectTreeFolder | null =>
  folders.find((folder) => folder.fixedKind === kind && (folder.parentId === null || folder.parentId === '')) ?? null;

/**
 * The section a folder lives in, found by walking `parentId` up to its root folder; `null` for the
 * project root (`folderId === null`), an unknown folder, or a root folder that is no section.
 */
export const resolveFolderSection = (
  folderId: string | null,
  folders: readonly IProjectTreeFolder[],
  config: TConfig = WORKFLOW_FIXED_FOLDERS,
): string | null => {
  if (folderId === null) return null;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    if (current.parentId === null) {
      return isFixedFolder(current) && configOf(current.fixedKind as string, config)
        ? (current.fixedKind as string)
        : null;
    }
    current = byId.get(current.parentId);
  }
  return null;
};

const sectionHint = (kind: string, folders: readonly IProjectTreeFolder[], config: TConfig): string => {
  const section = findSectionFolder(kind, folders);
  const name = configOf(kind, config)?.name ?? kind;
  return section ? `${name} (id ${section.id})` : name;
};

/**
 * `null` when a document of `type` may live in `folderId` (`null` = project root), else a reason
 * written for a human and an LLM, naming the correct section and its id when known.
 */
export const checkDocumentPlacement = (
  type: string,
  folderId: string | null,
  folders: readonly IProjectTreeFolder[],
  config: TConfig = WORKFLOW_FIXED_FOLDERS,
): string | null => {
  const required = sectionForDocumentType(type, config);
  if (required === null) {
    return folderId === null ? null : `"${type}" documents stay at the project root and cannot be placed in a folder`;
  }
  const target = sectionHint(required, folders, config);
  if (folderId === null) {
    return `"${type}" documents cannot live at the project root; place them in ${target} or one of its subfolders`;
  }
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) return `Folder "${folderId}" does not exist in this project; "${type}" documents belong in ${target}`;
  const actual = resolveFolderSection(folderId, folders, config);
  if (actual === required) return null;
  const where = actual === null ? 'outside any section' : `in ${configOf(actual, config)?.name ?? actual}`;
  return `"${type}" documents live in ${target}; folder "${folder.name}" is ${where}`;
};

/**
 * `null` when the folder `folderId` (new or existing) may have `parentId` as its parent, else a reason.
 * Rules: the root holds only the section folders, so a user folder needs a parent; the parent must
 * exist; no cycles; an existing folder may only move within its own section.
 */
export const checkFolderPlacement = (
  folderId: string,
  parentId: string | null,
  folders: readonly IProjectTreeFolder[],
  config: TConfig = WORKFLOW_FIXED_FOLDERS,
): string | null => {
  const sectionNames = config.map((section) => sectionHint(section.kind, folders, config)).join(', ');
  if (parentId === null) {
    return `The project root holds only the fixed sections; create the folder inside one of them (${sectionNames})`;
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  if (!byId.has(parentId)) return `Parent folder "${parentId}" does not exist in this project`;
  const seen = new Set<string>();
  let currentId: string | null = parentId;
  while (currentId !== null && !seen.has(currentId)) {
    if (currentId === folderId) return 'A folder cannot be moved into itself or one of its own subfolders';
    seen.add(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  if (byId.has(folderId)) {
    const from = resolveFolderSection(folderId, folders, config);
    const to = resolveFolderSection(parentId, folders, config);
    if (from !== to) {
      const fromName = from === null ? 'outside any section' : (configOf(from, config)?.name ?? from);
      return `A folder can only be moved within its own section (it is in ${fromName}); create a new folder in the target section instead`;
    }
  }
  return null;
};
