import type { IProjectTreeFolder } from '@falang/dto';
import {
  sectionForDocumentType,
  WORKFLOW_FIXED_FOLDERS,
  type IFixedFolderConfig,
  type ILayoutDocument,
} from './fixed-folders.js';

export interface INormalizeLayoutResult<D extends ILayoutDocument> {
  folders: IProjectTreeFolder[];
  documents: D[];
}

export interface INormalizeLayoutOptions {
  /** Mints ids for missing section folders and for the copies a mixed folder is split into. */
  createId: () => string;
  config?: readonly IFixedFolderConfig[];
}

/** Everything the steps below share: the sections, the user folders and the lookups over them. */
interface IContext {
  config: readonly IFixedFolderConfig[];
  createId: () => string;
  sectionByKind: Map<string, IProjectTreeFolder>;
  userFolders: IProjectTreeFolder[];
  userById: Map<string, IProjectTreeFolder>;
  /** Top-level user folder (hanging off a section or the root) of every user folder. */
  topOf: Map<string, string>;
  /** Tops that currently hang off the root (not inside a section) — they get relocated. */
  rootLevelTops: Set<string>;
  /** Section kind each top-level user folder ends up in (`null` = nothing sectioned below it). */
  homeOfTop: Map<string, string | null>;
  copies: Map<string, IProjectTreeFolder>;
}

const copyKey = (folderId: string, kind: string): string => `${folderId}\u0000${kind}`;

/** Splits the folders into sections (first root folder per valid kind, plus created missing ones) and user folders. */
const buildSections = (
  inputFolders: readonly IProjectTreeFolder[],
  config: readonly IFixedFolderConfig[],
  createId: () => string,
): { sectionByKind: Map<string, IProjectTreeFolder>; userFolders: IProjectTreeFolder[] } => {
  const kinds = new Set(config.map((section) => section.kind));
  const originalIds = new Set(inputFolders.map((folder) => folder.id));
  const sectionByKind = new Map<string, IProjectTreeFolder>();
  const userFolders: IProjectTreeFolder[] = [];
  for (const folder of inputFolders) {
    const isRoot = folder.parentId === null || !originalIds.has(folder.parentId);
    const kind = folder.fixedKind;
    if (isRoot && typeof kind === 'string' && kinds.has(kind) && !sectionByKind.has(kind)) {
      sectionByKind.set(kind, { ...folder, parentId: null });
    } else {
      userFolders.push({ id: folder.id, name: folder.name, parentId: folder.parentId });
    }
  }
  for (const section of config) {
    if (!sectionByKind.has(section.kind)) {
      sectionByKind.set(section.kind, { id: createId(), name: section.name, parentId: null, fixedKind: section.kind });
    }
  }
  return { sectionByKind, userFolders };
};

const userParentOf = (context: IContext, folder: IProjectTreeFolder): string | null =>
  folder.parentId !== null && context.userById.has(folder.parentId) ? folder.parentId : null;

/** Walks up to the top-level user folder; a loop is cut at the first repeated folder. */
const findTop = (context: IContext, folder: IProjectTreeFolder): string => {
  const seen = new Set<string>();
  let current = folder;
  while (!seen.has(current.id)) {
    seen.add(current.id);
    const parent = userParentOf(context, current);
    if (parent === null) break;
    current = context.userById.get(parent) as IProjectTreeFolder;
  }
  return current.id;
};

const sectionKindOfFolder = (context: IContext, folderId: string | null): string | null => {
  if (folderId === null) return null;
  for (const [kind, section] of context.sectionByKind) if (section.id === folderId) return kind;
  return null;
};

/** The section with most documents in `counts`, ties broken by config order; `null` when empty. */
const pickWinner = (config: readonly IFixedFolderConfig[], counts: Map<string, number> | undefined): string | null => {
  let best: string | null = null;
  let bestCount = 0;
  for (const section of config) {
    const count = counts?.get(section.kind) ?? 0;
    if (count > bestCount) {
      best = section.kind;
      bestCount = count;
    }
  }
  return best;
};

const homeOf = (context: IContext, folderId: string): string | null =>
  context.homeOfTop.get(context.topOf.get(folderId) as string) ?? null;

/** Decides, for every top-level user folder, which section it lives in (an existing one, or the winner by document count). */
const assignHomes = (
  context: IContext,
  inputFolders: readonly IProjectTreeFolder[],
  documents: readonly { folderId: string | null; section: string | null }[],
): void => {
  const countByTop = new Map<string, Map<string, number>>();
  for (const item of documents) {
    if (item.folderId === null || item.section === null) continue;
    const top = context.topOf.get(item.folderId) as string;
    const counts = countByTop.get(top) ?? new Map<string, number>();
    counts.set(item.section, (counts.get(item.section) ?? 0) + 1);
    countByTop.set(top, counts);
  }
  const foldersById = new Map(inputFolders.map((folder) => [folder.id, folder]));
  for (const topId of new Set(context.topOf.values())) {
    const top = context.userById.get(topId) as IProjectTreeFolder;
    const parentId = top.parentId !== null && foldersById.has(top.parentId) ? top.parentId : null;
    const existing = sectionKindOfFolder(context, parentId);
    if (existing === null) {
      context.rootLevelTops.add(topId);
      context.homeOfTop.set(topId, pickWinner(context.config, countByTop.get(topId)));
    } else {
      context.homeOfTop.set(topId, existing);
    }
  }
};

/** The copy of user folder `folderId` under section `kind` (created on first use, with its ancestor path). */
const copyOf = (context: IContext, folderId: string, kind: string): IProjectTreeFolder => {
  const key = copyKey(folderId, kind);
  const existing = context.copies.get(key);
  if (existing) return existing;
  const folder = context.userById.get(folderId) as IProjectTreeFolder;
  const parent = userParentOf(context, folder);
  const copy: IProjectTreeFolder = {
    id: context.createId(),
    name: folder.name,
    parentId:
      parent === null ? (context.sectionByKind.get(kind) as IProjectTreeFolder).id : copyOf(context, parent, kind).id,
  };
  context.copies.set(key, copy);
  return copy;
};

interface IDocumentItem<D extends ILayoutDocument> {
  document: D;
  /** The user folder it sits in (`null` = root, a section folder, or a dangling reference). */
  folderId: string | null;
  /** The section kind when the document sits directly in a section folder. */
  sectionFolderKind: string | null;
  section: string | null;
}

const placeDocument = <D extends ILayoutDocument>(context: IContext, item: IDocumentItem<D>): D => {
  const { document, section } = item;
  if (section === null) return document.folderId === null ? document : { ...document, folderId: null };
  const target = context.sectionByKind.get(section) as IProjectTreeFolder;
  if (item.sectionFolderKind !== null) {
    return item.sectionFolderKind === section ? document : { ...document, folderId: target.id };
  }
  if (item.folderId === null) return { ...document, folderId: target.id };
  if (homeOf(context, item.folderId) === section) return document;
  return { ...document, folderId: copyOf(context, item.folderId, section).id };
};

/** Folder ids (original and copies) that have a document somewhere below them. */
const collectFoldersWithDocuments = (context: IContext, documents: readonly ILayoutDocument[]): Set<string> => {
  const sectionIds = new Set([...context.sectionByKind.values()].map((section) => section.id));
  const copiesById = new Map([...context.copies.values()].map((copy) => [copy.id, copy]));
  const kept = new Set<string>();
  for (const document of documents) {
    let current = document.folderId;
    while (current !== null && !kept.has(current) && !sectionIds.has(current)) {
      kept.add(current);
      const folder = context.userById.get(current) ?? copiesById.get(current);
      current = folder?.parentId ?? null;
    }
  }
  return kept;
};

const buildOutputFolders = (context: IContext, outDocuments: readonly ILayoutDocument[]): IProjectTreeFolder[] => {
  const withDocuments = collectFoldersWithDocuments(context, outDocuments);
  const result: IProjectTreeFolder[] = [...context.sectionByKind.values()];
  for (const folder of context.userFolders) {
    const top = context.topOf.get(folder.id) as string;
    if (context.rootLevelTops.has(top) && !withDocuments.has(folder.id)) continue;
    if (folder.id !== top) {
      result.push(folder);
      continue;
    }
    const home = homeOf(context, folder.id);
    if (home === null) continue;
    result.push({ ...folder, parentId: (context.sectionByKind.get(home) as IProjectTreeFolder).id });
  }
  result.push(...context.copies.values());
  return result;
};

/**
 * Rearranges a project's folders/documents to satisfy the fixed-section rules (ADR 0055 (private) §5).
 * Pure, idempotent, never mutates its input. Rules: ensure the sections exist (folders carrying a
 * valid `fixedKind` at the root are them); a document goes into the section of its type — a root
 * document to the section root, a document in a user folder keeps its folder when that folder is
 * already in its section; a root-level user folder tree is placed under the section with most
 * documents below it (ids kept) and split by section for the others (copies get new ids); an empty
 * root-level tree is dropped; a document of a type with no section is moved to the root.
 */
export const normalizeWorkflowProjectLayout = <D extends ILayoutDocument>(
  inputFolders: readonly IProjectTreeFolder[],
  inputDocuments: readonly D[],
  options: INormalizeLayoutOptions,
): INormalizeLayoutResult<D> => {
  const config = options.config ?? WORKFLOW_FIXED_FOLDERS;
  const { sectionByKind, userFolders } = buildSections(inputFolders, config, options.createId);
  const context: IContext = {
    config,
    createId: options.createId,
    sectionByKind,
    userFolders,
    userById: new Map(userFolders.map((folder) => [folder.id, folder])),
    topOf: new Map(),
    rootLevelTops: new Set(),
    homeOfTop: new Map(),
    copies: new Map(),
  };
  for (const folder of userFolders) context.topOf.set(folder.id, findTop(context, folder));

  const items = inputDocuments.map(
    (document): IDocumentItem<D> => ({
      document,
      folderId: document.folderId !== null && context.userById.has(document.folderId) ? document.folderId : null,
      sectionFolderKind: sectionKindOfFolder(context, document.folderId),
      section: sectionForDocumentType(document.type, config),
    }),
  );
  assignHomes(context, inputFolders, items);

  const outDocuments = items.map((item) => placeDocument(context, item));
  return { folders: buildOutputFolders(context, outDocuments), documents: outDocuments };
};
