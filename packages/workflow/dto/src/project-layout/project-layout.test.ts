import { describe, expect, it } from 'vitest';
import type { IProjectTreeFolder } from '@falang/dto';
import {
  checkDocumentPlacement,
  checkFolderPlacement,
  findSectionFolder,
  isFixedFolder,
  normalizeWorkflowProjectLayout,
  resolveFolderSection,
  sectionForDocumentType,
  type ILayoutDocument,
} from './index.js';

const section = (kind: string, name: string): IProjectTreeFolder => ({
  id: `s-${kind}`,
  name,
  parentId: null,
  fixedKind: kind,
});
const SECTIONS = [section('triggers', 'Triggers'), section('functions', 'Functions'), section('types', 'Types')];
const doc = (id: string, type: string, folderId: string | null, pinned = false): ILayoutDocument => ({
  id,
  type,
  folderId,
  pinned,
});
const counter = () => {
  let n = 0;
  return () => {
    n += 1;
    return `new-${n}`;
  };
};

describe('sections lookup', () => {
  it('maps document types to sections', () => {
    expect(sectionForDocumentType('trigger-function')).toBe('triggers');
    expect(sectionForDocumentType('function')).toBe('functions');
    expect(sectionForDocumentType('objects-structure')).toBe('types');
    expect(sectionForDocumentType('integrations')).toBeNull();
  });

  it('finds section folders and resolves the section of nested folders', () => {
    const folders = [
      ...SECTIONS,
      { id: 'a', name: 'A', parentId: 's-functions' },
      { id: 'b', name: 'B', parentId: 'a' },
    ];
    expect(findSectionFolder('functions', folders)?.id).toBe('s-functions');
    expect(findSectionFolder('nope', folders)).toBeNull();
    expect(resolveFolderSection('b', folders)).toBe('functions');
    expect(resolveFolderSection('s-types', folders)).toBe('types');
    expect(resolveFolderSection(null, folders)).toBeNull();
    expect(resolveFolderSection('missing', folders)).toBeNull();
    expect(isFixedFolder(SECTIONS[0])).toBe(true);
    expect(isFixedFolder(folders[3])).toBe(false);
  });
});

describe('checkDocumentPlacement', () => {
  const folders = [...SECTIONS, { id: 'a', name: 'Sub', parentId: 's-functions' }];
  it('accepts the section root and nested folders of the right section', () => {
    expect(checkDocumentPlacement('function', 's-functions', folders)).toBeNull();
    expect(checkDocumentPlacement('function', 'a', folders)).toBeNull();
    expect(checkDocumentPlacement('integrations', null, folders)).toBeNull();
  });
  it('rejects the root, other sections, unknown folders with a reason naming the section', () => {
    expect(checkDocumentPlacement('function', null, folders)).toContain('Functions (id s-functions)');
    expect(checkDocumentPlacement('function', 's-triggers', folders)).toContain('Functions (id s-functions)');
    expect(checkDocumentPlacement('trigger-function', 'a', folders)).toContain('Triggers (id s-triggers)');
    expect(checkDocumentPlacement('function', 'zzz', folders)).toContain('does not exist');
    expect(checkDocumentPlacement('integrations', 'a', folders)).toContain('project root');
  });
});

describe('checkFolderPlacement', () => {
  const folders = [
    ...SECTIONS,
    { id: 'a', name: 'A', parentId: 's-functions' },
    { id: 'b', name: 'B', parentId: 'a' },
    { id: 't', name: 'T', parentId: 's-triggers' },
  ];
  it('accepts new folders under a section/subfolder and moves inside a section', () => {
    expect(checkFolderPlacement('new', 's-types', folders)).toBeNull();
    expect(checkFolderPlacement('new', 'a', folders)).toBeNull();
    expect(checkFolderPlacement('b', 's-functions', folders)).toBeNull();
  });
  it('rejects root, unknown parent, cycles and cross-section moves', () => {
    expect(checkFolderPlacement('new', null, folders)).toContain('Triggers (id s-triggers)');
    expect(checkFolderPlacement('new', 'zzz', folders)).toContain('does not exist');
    expect(checkFolderPlacement('a', 'b', folders)).toContain('itself');
    expect(checkFolderPlacement('a', 'a', folders)).toContain('itself');
    expect(checkFolderPlacement('b', 't', folders)).toContain('own section');
  });
});

describe('normalizeWorkflowProjectLayout', () => {
  it('creates missing sections and moves root documents', () => {
    const { folders, documents } = normalizeWorkflowProjectLayout(
      [],
      [
        doc('i', 'integrations', null, true),
        doc('f', 'function', null),
        doc('t', 'trigger-function', null),
        doc('o', 'objects-structure', null),
      ],
      { createId: counter() },
    );
    expect(folders.map((f) => [f.name, f.fixedKind, f.parentId])).toEqual([
      ['Triggers', 'triggers', null],
      ['Functions', 'functions', null],
      ['Types', 'types', null],
    ]);
    const byKind = Object.fromEntries(folders.map((f) => [f.fixedKind, f.id]));
    expect(documents.find((d) => d.id === 'i')?.folderId).toBeNull();
    expect(documents.find((d) => d.id === 'f')?.folderId).toBe(byKind.functions);
    expect(documents.find((d) => d.id === 't')?.folderId).toBe(byKind.triggers);
    expect(documents.find((d) => d.id === 'o')?.folderId).toBe(byKind.types);
  });

  it('splits a mixed user folder by section; the section with most documents keeps the ids', () => {
    const input = [{ id: 'tg', name: 'Telegram', parentId: null }];
    const { folders, documents } = normalizeWorkflowProjectLayout(
      input,
      [doc('on', 'trigger-function', 'tg'), doc('send', 'function', 'tg'), doc('fmt', 'function', 'tg')],
      { createId: counter() },
    );
    const sectionId = (kind: string) => folders.find((f) => f.fixedKind === kind)?.id;
    const original = folders.find((f) => f.id === 'tg');
    expect(original?.parentId).toBe(sectionId('functions'));
    const copy = folders.find((f) => f.name === 'Telegram' && f.id !== 'tg');
    expect(copy?.parentId).toBe(sectionId('triggers'));
    expect(documents.find((d) => d.id === 'send')?.folderId).toBe('tg');
    expect(documents.find((d) => d.id === 'fmt')?.folderId).toBe('tg');
    expect(documents.find((d) => d.id === 'on')?.folderId).toBe(copy?.id);
  });

  it('recreates nested paths for copies and drops empty root folder trees and empty branches', () => {
    const input = [
      { id: 'a', name: 'A', parentId: null },
      { id: 'b', name: 'B', parentId: 'a' },
      { id: 'c', name: 'C', parentId: 'a' },
      { id: 'empty', name: 'Empty', parentId: null },
      { id: 'empty2', name: 'Empty2', parentId: 'empty' },
    ];
    const { folders, documents } = normalizeWorkflowProjectLayout(
      input,
      [doc('f1', 'function', 'b'), doc('f2', 'function', 'b'), doc('t1', 'trigger-function', 'b')],
      { createId: counter() },
    );
    expect(folders.some((f) => f.id === 'empty' || f.id === 'empty2')).toBe(false);
    expect(folders.some((f) => f.id === 'c')).toBe(false);
    const names = folders.filter((f) => !f.fixedKind).map((f) => f.name);
    expect(names.toSorted()).toEqual(['A', 'A', 'B', 'B']);
    const triggersId = folders.find((f) => f.fixedKind === 'triggers')?.id;
    const copyA = folders.find((f) => f.name === 'A' && f.id !== 'a');
    const copyB = folders.find((f) => f.name === 'B' && f.id !== 'b');
    expect(copyA?.parentId).toBe(triggersId);
    expect(copyB?.parentId).toBe(copyA?.id);
    expect(documents.find((d) => d.id === 't1')?.folderId).toBe(copyB?.id);
    expect(documents.find((d) => d.id === 'f1')?.folderId).toBe('b');
  });

  it('maps imported sections by fixedKind (keeping their ids) and keeps valid layouts untouched', () => {
    const folders: IProjectTreeFolder[] = [
      { id: 'X', name: 'Funcs', parentId: null, fixedKind: 'functions' },
      { id: 'sub', name: 'Sub', parentId: 'X' },
      { id: 'emptysub', name: 'EmptySub', parentId: 'X' },
    ];
    const documents = [doc('f', 'function', 'sub')];
    const result = normalizeWorkflowProjectLayout(folders, documents, { createId: counter() });
    expect(result.folders.find((f) => f.fixedKind === 'functions')?.id).toBe('X');
    expect(result.folders.map((f) => f.id)).toEqual(expect.arrayContaining(['X', 'sub', 'emptysub']));
    expect(result.documents).toEqual(documents);
  });

  it('moves a misplaced document out of a wrong-section folder', () => {
    const folders: IProjectTreeFolder[] = [...SECTIONS, { id: 'q', name: 'Q', parentId: 's-functions' }];
    const { folders: out, documents } = normalizeWorkflowProjectLayout(folders, [doc('t', 'trigger-function', 'q')], {
      createId: counter(),
    });
    const copy = out.find((f) => f.name === 'Q' && f.id !== 'q');
    expect(copy?.parentId).toBe('s-triggers');
    expect(documents[0]?.folderId).toBe(copy?.id);
  });

  it('is idempotent', () => {
    const first = normalizeWorkflowProjectLayout(
      [
        { id: 'tg', name: 'Telegram', parentId: null },
        { id: 'e', name: 'E', parentId: null },
      ],
      [
        doc('on', 'trigger-function', 'tg'),
        doc('send', 'function', 'tg'),
        doc('x', 'objects-structure', null),
        doc('i', 'integrations', null, true),
      ],
      { createId: counter() },
    );
    const second = normalizeWorkflowProjectLayout(first.folders, first.documents, { createId: counter() });
    expect(second).toEqual(first);
  });

  it('treats dangling parents and folders as the root and keeps a cycle from hanging', () => {
    const { folders, documents } = normalizeWorkflowProjectLayout(
      [
        { id: 'p', name: 'P', parentId: 'gone' },
        { id: 'c1', name: 'C1', parentId: 'c2' },
        { id: 'c2', name: 'C2', parentId: 'c1' },
      ],
      [doc('f', 'function', 'p'), doc('g', 'function', 'c1'), doc('h', 'function', 'ghost')],
      { createId: counter() },
    );
    expect(folders.find((f) => f.id === 'p')?.parentId).toBe(folders.find((f) => f.fixedKind === 'functions')?.id);
    expect(documents.find((d) => d.id === 'h')?.folderId).toBe(folders.find((f) => f.fixedKind === 'functions')?.id);
    expect(folders.length).toBeGreaterThanOrEqual(3);
  });
});
