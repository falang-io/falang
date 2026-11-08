import { describe, expect, it } from 'vitest';
import type { WorkflowDocument, WorkflowFolder } from '../workflow-types.js';
import {
  buildProjectTreeNodes,
  canDropInProject,
  getDocumentMenuKeys,
  getFolderMenuKeys,
  isFixedFolderKey,
  withFixedFoldersExpanded,
} from './project-tree-model.js';

const folders: WorkflowFolder[] = [
  { id: 'f', name: 'Functions', parentId: null, fixedKind: 'functions' },
  { id: 't', name: 'Triggers', parentId: null, fixedKind: 'triggers' },
  { id: 'y', name: 'Types', parentId: null, fixedKind: 'types' },
  { id: 'tb', name: 'Tables', parentId: null, fixedKind: 'tables' },
  { id: 'sub', name: 'Helpers', parentId: 'f' },
];
const documents: WorkflowDocument[] = [
  { id: 'a', name: 'fnA', type: 'function', folderId: 'sub' },
  { id: 'b', name: 'trgB', type: 'trigger-function', folderId: 't' },
  { id: 'c', name: 'Constants', type: 'constants', folderId: null, pinned: true },
  { id: 'i', name: 'Integrations', type: 'integrations', folderId: null, pinned: true },
];
const label = (kind: string): string => kind.toUpperCase();

describe('project tree model', () => {
  it('orders root: pinned docs (Integrations, Constants), then sections in config order', () => {
    const nodes = buildProjectTreeNodes(folders, documents, label);
    expect(nodes.map((n) => n.title)).toEqual([
      'Integrations',
      'Constants',
      'TRIGGERS',
      'FUNCTIONS',
      'TYPES',
      'TABLES',
    ]);
    expect(nodes[0]?.disableDrag).toBe(true);
    expect(nodes[1]?.disableDrag).toBe(true);
    expect(nodes[2]?.disableDrag).toBe(true);
    const functions = nodes[3];
    expect(functions?.children?.map((n) => n.title)).toEqual(['Helpers']);
    expect(functions?.children?.[0]?.disableDrag).toBe(false);
  });

  it('builds menus per section', () => {
    expect(getFolderMenuKeys('t', folders)).toEqual(['new-subfolder', 'new-trigger']);
    expect(getFolderMenuKeys('y', folders)).toEqual(['new-subfolder', 'new-object']);
    expect(getFolderMenuKeys('tb', folders)).toEqual(['new-subfolder', 'new-table']);
    expect(getFolderMenuKeys('sub', folders)).toEqual(['new-subfolder', 'new-function', 'rename', 'delete']);
  });

  it('offers rename/delete for documents except pinned ones', () => {
    expect(getDocumentMenuKeys(documents[0])).toEqual(['rename', 'delete']);
    expect(getDocumentMenuKeys(documents[2])).toEqual([]);
    expect(getDocumentMenuKeys()).toEqual([]);
  });

  it('drops a table only into the Tables section', () => {
    const docs: WorkflowDocument[] = [...documents, { id: 'tt', name: 'clients', type: 'table', folderId: 'tb' }];
    expect(canDropInProject({ kind: 'doc', id: 'tt' }, 'tb', folders, docs)).toBe(true);
    expect(canDropInProject({ kind: 'doc', id: 'tt' }, 'f', folders, docs)).toBe(false);
  });

  it('allows drops only within the right section and never at the root', () => {
    expect(canDropInProject({ kind: 'doc', id: 'a' }, 'f', folders, documents)).toBe(true);
    expect(canDropInProject({ kind: 'doc', id: 'a' }, 't', folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'doc', id: 'a' }, null, folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'doc', id: 'i' }, 'f', folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'folder', id: 'sub' }, 't', folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'folder', id: 'f' }, 'sub', folders, documents)).toBe(false);
  });

  it('keeps every section folder expanded', () => {
    expect(withFixedFoldersExpanded([], folders)).toEqual(['folder:f', 'folder:t', 'folder:y', 'folder:tb']);
    expect(withFixedFoldersExpanded(['folder:sub', 'folder:t'], folders)).toEqual([
      'folder:sub',
      'folder:t',
      'folder:f',
      'folder:y',
      'folder:tb',
    ]);
  });

  it('recognises section folder keys only', () => {
    expect(isFixedFolderKey('folder:t', folders)).toBe(true);
    expect(isFixedFolderKey('folder:sub', folders)).toBe(false);
    expect(isFixedFolderKey('doc:b', folders)).toBe(false);
    expect(isFixedFolderKey('folder:missing', folders)).toBe(false);
  });
});
