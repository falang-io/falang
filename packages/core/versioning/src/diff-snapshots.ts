import { diffNodeTrees, type INodeTreeDiff } from './diff-node-trees.js';
import { diffFieldPaths, type IFieldChange } from './field-diff.js';
import type { IProjectSnapshot, ISnapshotDocument } from './snapshot.js';

export interface IDocumentDiff {
  documentId: string;
  name: string;
  type: string;
  kind: 'added' | 'removed' | 'modified' | 'unchanged';
  renamed?: { from: string; to: string };
  movedTo?: { from: string | null; to: string | null };
  tree?: INodeTreeDiff;
  dataFields?: IFieldChange[];
}

export interface IFolderChange {
  folderId: string;
  name: string;
  kind: 'added' | 'removed' | 'renamed' | 'moved';
  renamed?: { from: string; to: string };
  movedTo?: { from: string | null; to: string | null };
}

export interface IProjectDiff {
  documents: IDocumentDiff[];
  folders: IFolderChange[];
  isEmpty: boolean;
}

type IProjectFolder = IProjectSnapshot['folders'][number];

const orderedIdUnion = <T extends { id: string }>(primary: T[], secondary: T[]): string[] => {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of primary) {
    if (!seen.has(item.id)) {
      ids.push(item.id);
      seen.add(item.id);
    }
  }
  for (const item of secondary) {
    if (!seen.has(item.id)) {
      ids.push(item.id);
      seen.add(item.id);
    }
  }
  return ids;
};

const diffDocument = (docA: ISnapshotDocument | null, docB: ISnapshotDocument | null): IDocumentDiff => {
  if (docB === null && docA !== null) {
    return { documentId: docA.id, name: docA.name, type: docA.type, kind: 'removed' };
  }
  if (docA === null && docB !== null) {
    return { documentId: docB.id, name: docB.name, type: docB.type, kind: 'added' };
  }
  const a = docA as ISnapshotDocument;
  const b = docB as ISnapshotDocument;

  const renamedChange = a.name === b.name ? {} : { renamed: { from: a.name, to: b.name } };
  const movedToChange = a.folderId === b.folderId ? {} : { movedTo: { from: a.folderId, to: b.folderId } };

  const hasTree = 'root' in a || 'root' in b;
  const tree = hasTree ? diffNodeTrees(a.root, b.root) : null;
  const treeChange = tree === null ? {} : { tree };

  // `dataFields` only applies to `custom`-typed documents (e.g. `integrations`) — ones with `data`
  // and no `root` at all, per ADR 0025 (private).
  const hasData = 'data' in a || 'data' in b;
  const dataFieldChanges = !hasTree && hasData ? diffFieldPaths('data', a.data, b.data) : [];
  const dataFieldsChange = dataFieldChanges.length > 0 ? { dataFields: dataFieldChanges } : {};

  const modified =
    'renamed' in renamedChange ||
    'movedTo' in movedToChange ||
    (tree !== null && !tree.isEmpty) ||
    'dataFields' in dataFieldsChange;

  return {
    documentId: b.id,
    name: b.name,
    type: b.type,
    kind: modified ? 'modified' : 'unchanged',
    ...renamedChange,
    ...movedToChange,
    ...treeChange,
    ...dataFieldsChange,
  };
};

const diffFolder = (folderA: IProjectFolder | null, folderB: IProjectFolder | null): IFolderChange | null => {
  if (folderB === null && folderA !== null) {
    return { folderId: folderA.id, name: folderA.name, kind: 'removed' };
  }
  if (folderA === null && folderB !== null) {
    return { folderId: folderB.id, name: folderB.name, kind: 'added' };
  }
  const a = folderA as IProjectFolder;
  const b = folderB as IProjectFolder;

  const isRenamed = a.name !== b.name;
  const isMoved = a.parentId !== b.parentId;
  if (!isRenamed && !isMoved) {
    return null;
  }
  const renamedChange = isRenamed ? { renamed: { from: a.name, to: b.name } } : {};
  const movedToChange = isMoved ? { movedTo: { from: a.parentId, to: b.parentId } } : {};
  // Both renamed and moved collapse into one entry, `kind: 'renamed'`, both fields set (ADR:
  // "a folder both renamed and moved → one entry, kind: 'renamed', both fields set").
  return { folderId: b.id, name: b.name, kind: isRenamed ? 'renamed' : 'moved', ...renamedChange, ...movedToChange };
};

/**
 * Diffs two whole-project snapshots (per ADR 0025 (private), "The diff
 * engine"): documents and folders matched by id.
 */
export const diffSnapshots = (a: IProjectSnapshot, b: IProjectSnapshot): IProjectDiff => {
  const documentIds = orderedIdUnion(b.documents, a.documents);
  const documents = documentIds.map((id) =>
    diffDocument(a.documents.find((doc) => doc.id === id) ?? null, b.documents.find((doc) => doc.id === id) ?? null),
  );

  const folderIds = orderedIdUnion(b.folders, a.folders);
  const folders: IFolderChange[] = [];
  for (const id of folderIds) {
    const change = diffFolder(
      a.folders.find((folder) => folder.id === id) ?? null,
      b.folders.find((folder) => folder.id === id) ?? null,
    );
    if (change !== null) {
      folders.push(change);
    }
  }

  return {
    documents,
    folders,
    isEmpty: folders.length === 0 && documents.every((doc) => doc.kind === 'unchanged'),
  };
};

/** `head === null` means there's no commit yet — dirty iff the working copy has any document or folder. */
export const isSnapshotDirty = (head: IProjectSnapshot | null, workingCopy: IProjectSnapshot): boolean => {
  if (head === null) {
    return workingCopy.documents.length > 0 || workingCopy.folders.length > 0;
  }
  return !diffSnapshots(head, workingCopy).isEmpty;
};
