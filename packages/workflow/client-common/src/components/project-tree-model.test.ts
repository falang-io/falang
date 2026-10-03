import { describe, expect, it } from 'vitest';
import type { WorkflowDocument, WorkflowFolder } from '../workflow-types.js';
import {
  buildProjectTreeNodes,
  canDropInProject,
  getDocumentMenuKeys,
  getFolderMenuKeys,
} from './project-tree-model.js';

const folders: WorkflowFolder[] = [
  { id: 'f', name: 'Functions', parentId: null, fixedKind: 'functions' },
  { id: 't', name: 'Triggers', parentId: null, fixedKind: 'triggers' },
  { id: 'y', name: 'Types', parentId: null, fixedKind: 'types' },
  { id: 'sub', name: 'Helpers', parentId: 'f' },
];
const documents: WorkflowDocument[] = [
  { id: 'a', name: 'fnA', type: 'function', folderId: 'sub' },
  { id: 'b', name: 'trgB', type: 'trigger-function', folderId: 't' },
  { id: 'i', name: 'Integrations', type: 'integrations', folderId: null, pinned: true },
];
const label = (kind: string): string => kind.toUpperCase();

describe('project tree model', () => {
  it('orders root: pinned doc, then sections in config order', () => {
    const nodes = buildProjectTreeNodes(folders, documents, label);
    expect(nodes.map((n) => n.title)).toEqual(['Integrations', 'TRIGGERS', 'FUNCTIONS', 'TYPES']);
    expect(nodes[0]?.disableDrag).toBe(true);
    expect(nodes[1]?.disableDrag).toBe(true);
    const functions = nodes[2];
    expect(functions?.children?.map((n) => n.title)).toEqual(['Helpers']);
    expect(functions?.children?.[0]?.disableDrag).toBe(false);
  });

  it('builds menus per section', () => {
    expect(getFolderMenuKeys('t', folders)).toEqual(['new-subfolder', 'new-trigger']);
    expect(getFolderMenuKeys('y', folders)).toEqual(['new-subfolder', 'new-object']);
    expect(getFolderMenuKeys('sub', folders)).toEqual(['new-subfolder', 'new-function', 'rename', 'delete']);
  });

  it('offers rename/delete for documents except pinned ones', () => {
    expect(getDocumentMenuKeys(documents[0])).toEqual(['rename', 'delete']);
    expect(getDocumentMenuKeys(documents[2])).toEqual([]);
    expect(getDocumentMenuKeys()).toEqual([]);
  });

  it('allows drops only within the right section and never at the root', () => {
    expect(canDropInProject({ kind: 'doc', id: 'a' }, 'f', folders, documents)).toBe(true);
    expect(canDropInProject({ kind: 'doc', id: 'a' }, 't', folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'doc', id: 'a' }, null, folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'doc', id: 'i' }, 'f', folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'folder', id: 'sub' }, 't', folders, documents)).toBe(false);
    expect(canDropInProject({ kind: 'folder', id: 'f' }, 'sub', folders, documents)).toBe(false);
  });
});
