import {
  checkDocumentPlacement,
  checkFolderPlacement,
  isFixedFolder,
  resolveFolderSection,
  WORKFLOW_FIXED_FOLDERS,
  WORKFLOW_FIXED_FOLDER_KINDS,
} from '@falang/workflow-dto';
import type { WorkflowDocument, WorkflowFolder } from '../workflow-types.js';

/** Plain tree node (structurally a subset of antd's `TreeDataNode`) — kept free of React so it is unit-testable. */
export interface IProjectTreeNode {
  key: string;
  title: string;
  /** `folder` / `section:<kind>` / document type — the component maps it to an icon. */
  iconKind: string;
  isLeaf: boolean;
  /** Section folders and pinned documents cannot be dragged. */
  disableDrag: boolean;
  children?: IProjectTreeNode[];
}

const sectionOrder = (folder: WorkflowFolder): number => {
  const index = (WORKFLOW_FIXED_FOLDER_KINDS as readonly (string | null | undefined)[]).indexOf(folder.fixedKind);
  return index === -1 ? WORKFLOW_FIXED_FOLDER_KINDS.length : index;
};

const toDocNode = (doc: WorkflowDocument): IProjectTreeNode => ({
  key: `doc:${doc.id}`,
  title: doc.name,
  iconKind: doc.type,
  isLeaf: true,
  disableDrag: doc.pinned === true,
});

/**
 * Tree of a workflow project (ADR 0055 (private)): at the root the pinned documents first, then the
 * section folders in config order (anything else after them); inside a folder, folders then documents.
 */
export const buildProjectTreeNodes = (
  folders: readonly WorkflowFolder[],
  documents: readonly WorkflowDocument[],
  sectionLabel: (kind: string, fallback: string) => string,
  parentId: string | null = null,
): IProjectTreeNode[] => {
  const nodes: IProjectTreeNode[] = [];
  const levelFolders = folders.filter((folder) => folder.parentId === parentId);
  const levelDocs = documents.filter((doc) => doc.folderId === parentId);
  if (parentId === null) {
    nodes.push(...levelDocs.filter((doc) => doc.pinned).map((doc) => toDocNode(doc)));
    levelFolders.sort((a, b) => sectionOrder(a) - sectionOrder(b));
  }
  for (const folder of levelFolders) {
    const fixed = isFixedFolder(folder);
    nodes.push({
      key: `folder:${folder.id}`,
      title: fixed ? sectionLabel(folder.fixedKind as string, folder.name) : folder.name,
      iconKind: fixed ? `section:${folder.fixedKind}` : 'folder',
      isLeaf: false,
      disableDrag: fixed,
      children: buildProjectTreeNodes(folders, documents, sectionLabel, folder.id),
    });
  }
  nodes.push(...levelDocs.filter((doc) => parentId !== null || !doc.pinned).map((doc) => toDocNode(doc)));
  return nodes;
};

export type TFolderMenuKey = 'new-subfolder' | 'rename' | 'new-trigger' | 'new-function' | 'new-object' | 'delete';

const MENU_KEY_BY_TYPE: Record<string, TFolderMenuKey> = {
  'trigger-function': 'new-trigger',
  function: 'new-function',
  'objects-structure': 'new-object',
};

/** Context-menu entries of a section or a user folder: its own document types only, delete for user folders only. */
export const getFolderMenuKeys = (folderId: string, folders: readonly WorkflowFolder[]): TFolderMenuKey[] => {
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) return [];
  const kind = resolveFolderSection(folderId, folders);
  const section = WORKFLOW_FIXED_FOLDERS.find((item) => item.kind === kind);
  const keys: TFolderMenuKey[] = ['new-subfolder'];
  for (const type of section?.documentTypes ?? []) {
    const key = MENU_KEY_BY_TYPE[type];
    if (key) keys.push(key);
  }
  if (!isFixedFolder(folder)) keys.push('rename', 'delete');
  return keys;
};

export type TDocumentMenuKey = 'rename' | 'delete';

/** Context-menu entries of a document: none for a pinned one (`Integrations`). */
export const getDocumentMenuKeys = (doc?: Pick<WorkflowDocument, 'pinned'>): TDocumentMenuKey[] =>
  !doc || doc.pinned ? [] : ['rename', 'delete'];

/** Where a drag may land; `targetParentId === null` (the project root) is always refused. */
export const canDropInProject = (
  drag: { kind: 'folder' | 'doc'; id: string },
  targetParentId: string | null,
  folders: readonly WorkflowFolder[],
  documents: readonly WorkflowDocument[],
): boolean => {
  if (drag.kind === 'doc') {
    const doc = documents.find((item) => item.id === drag.id);
    if (!doc || doc.pinned) return false;
    return checkDocumentPlacement(doc.type, targetParentId, folders) === null;
  }
  const folder = folders.find((item) => item.id === drag.id);
  if (!folder || isFixedFolder(folder)) return false;
  return checkFolderPlacement(drag.id, targetParentId, folders) === null;
};

const expandedStorageKey = (projectId: string): string => `falang:project-tree-expanded:${projectId}`;

/** Expanded node keys remembered for a project (`null` = nothing stored yet). Storage may be unavailable. */
export const loadExpandedKeys = (projectId: string): string[] | null => {
  try {
    const raw = globalThis.localStorage?.getItem(expandedStorageKey(projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : null;
  } catch {
    return null;
  }
};

export const saveExpandedKeys = (projectId: string, keys: readonly string[]): void => {
  try {
    globalThis.localStorage?.setItem(expandedStorageKey(projectId), JSON.stringify(keys));
  } catch {
    // storage unavailable — expansion just isn't remembered
  }
};
