// oxlint-disable unicorn/no-await-expression-member, max-lines, unicorn/consistent-function-scoping, unicorn/no-array-sort, no-undefined, unicorn/escape-case, unicorn/prefer-string-raw
import { describe, expect, it } from 'vitest';
import { computeFileName, computeDirName, pickUniqueSegment, sanitizeSegment, folderDirChain } from './layout.js';
import type { IManifestDocument, IManifestFolder } from './types.js';

describe('sanitizeSegment', () => {
  it('replaces forbidden characters and control chars with underscores', () => {
    expect(sanitizeSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(sanitizeSegment('tab\there\u007f')).toBe('tab_here_');
  });

  it('keeps Unicode and inner spaces', () => {
    expect(sanitizeSegment('Нарисовать еду 2')).toBe('Нарисовать еду 2');
  });

  it('trims whitespace and trailing dots, falls back to untitled', () => {
    expect(sanitizeSegment('  name. . ')).toBe('name');
    expect(sanitizeSegment('   ')).toBe('untitled');
    expect(sanitizeSegment('...')).toBe('untitled');
    expect(sanitizeSegment('')).toBe('untitled');
  });

  it('prefixes a leading dot', () => {
    expect(sanitizeSegment('.hidden')).toBe('_.hidden');
    expect(sanitizeSegment('..')).toBe('untitled');
  });

  it('avoids Windows reserved device names, case-insensitively and with extensions', () => {
    expect(sanitizeSegment('CON')).toBe('CON_');
    expect(sanitizeSegment('lpt1')).toBe('lpt1_');
    expect(sanitizeSegment('Aux.txt')).toBe('Aux_.txt');
    expect(sanitizeSegment('console')).toBe('console');
  });

  it('caps the length without splitting a surrogate pair', () => {
    expect(sanitizeSegment('x'.repeat(300))).toHaveLength(120);
    const result = sanitizeSegment(`${'x'.repeat(119)}😀tail`);
    expect(result).toBe('x'.repeat(119));
    expect(sanitizeSegment(`${'x'.repeat(118)}😀`)).toBe(`${'x'.repeat(118)}😀`);
  });
});

describe('uniqueness', () => {
  it('appends (2), (3) on collision', () => {
    const taken = new Set(['a.json', 'a (2).json']);
    expect(pickUniqueSegment('a', '.json', taken)).toBe('a (3)');
    expect(pickUniqueSegment('b', '.json', taken)).toBe('b');
  });

  const doc = (id: string, name: string, fileName: string, folderId: string | null = null): IManifestDocument => ({
    id,
    type: 'contour',
    name,
    folderId,
    fileName,
  });

  it('is case-insensitive among siblings', () => {
    const tree = { folders: [], documents: [doc('1', 'Main', 'Main')] };
    expect(computeFileName(tree, { id: '2', name: 'main' }, null)).toBe('main (2)');
  });

  it('lets a document and a folder share one namespace per parent (folder has no extension)', () => {
    const folders: IManifestFolder[] = [{ id: 'f', name: 'Game.json', parentId: null, dirName: 'Game.json' }];
    const tree = { folders, documents: [] };
    expect(computeFileName(tree, { id: '2', name: 'Game' }, null)).toBe('Game (2)');
    // a folder named like a document sans extension doesn't clash with it
    const tree2 = { folders: [], documents: [doc('1', 'Game', 'Game')] };
    expect(computeDirName(tree2, { id: 'f', name: 'Game' }, null)).toBe('Game');
    expect(computeDirName(tree2, { id: 'f', name: 'Game.json' }, null)).toBe('Game.json (2)');
  });

  it('does not count the entry itself as taken (same name / case-only change)', () => {
    const tree = { folders: [], documents: [doc('1', 'Main', 'Main')] };
    expect(computeFileName(tree, { id: '1', name: 'Main' }, null)).toBe('Main');
    expect(computeFileName(tree, { id: '1', name: 'MAIN' }, null)).toBe('MAIN');
  });

  it('builds the folder chain outermost first', () => {
    const folders: IManifestFolder[] = [
      { id: 'a', name: 'A', parentId: null, dirName: 'A' },
      { id: 'b', name: 'B', parentId: 'a', dirName: 'B (2)' },
    ];
    expect(folderDirChain({ folders, documents: [] }, 'b')).toEqual(['A', 'B (2)']);
    expect(folderDirChain({ folders, documents: [] }, null)).toEqual([]);
  });
});
