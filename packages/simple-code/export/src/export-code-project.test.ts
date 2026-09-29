import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportCodeProject } from './export-code-project.js';

const doc = (partial: Partial<IProjectDocument> & { id: string; type: string; name: string }): IProjectDocument =>
  partial as IProjectDocument;

const actionRoot = (code: string) => ({ id: `${code}-root`, name: 'action', data: code }) as IProjectDocument['root'];

describe('exportCodeProject', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-export-test-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('skips non-code document types', async () => {
    const documents = [doc({ id: '1', type: 'function', name: 'Not code', root: actionRoot('x') })];
    const result = await exportCodeProject({ projectDir, documents });
    expect(result.items).toEqual([]);
    await expect(fs.access(path.join(projectDir, 'generated'))).rejects.toThrow();
  });

  it('creates generated/ and writes one file per code document, named by language extension', async () => {
    const documents = [
      doc({ id: '1', type: 'simple-code-cpp', name: 'main', root: actionRoot('int x = 1;') }),
      doc({ id: '2', type: 'simple-code-rust', name: 'lib', root: actionRoot('let x = 1;') }),
    ];
    const result = await exportCodeProject({ projectDir, documents });
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.ok)).toBe(true);

    const cppFile = await fs.readFile(path.join(projectDir, 'generated', 'main.cpp'), 'utf8');
    expect(cppFile).toBe('int x = 1;\n');
    const rustFile = await fs.readFile(path.join(projectDir, 'generated', 'lib.rs'), 'utf8');
    expect(rustFile).toBe('let x = 1;\n');
  });

  it('disambiguates two documents that would write the same file name', async () => {
    const documents = [
      doc({ id: 'aaaaaa1', type: 'simple-code-cpp', name: 'main', root: actionRoot('one();') }),
      doc({ id: 'bbbbbb2', type: 'simple-code-cpp', name: 'main', root: actionRoot('two();') }),
    ];
    const result = await exportCodeProject({ projectDir, documents });
    expect(result.items.every((item) => item.ok)).toBe(true);
    const files = await fs.readdir(path.join(projectDir, 'generated'));
    expect(files.toSorted()).toEqual(['main-bbbbbb.cpp', 'main.cpp']);
  });

  it('reports a per-document error without aborting the others', async () => {
    const documents = [
      doc({ id: '1', type: 'simple-code-cpp', name: 'broken' }),
      doc({ id: '2', type: 'simple-code-cpp', name: 'ok', root: actionRoot('fine();') }),
    ];
    const result = await exportCodeProject({ projectDir, documents });
    const broken = result.items.find((item) => item.documentId === '1');
    const ok = result.items.find((item) => item.documentId === '2');
    expect(broken?.ok).toBe(false);
    expect(broken?.error).toBe('Document has no root node');
    expect(ok?.ok).toBe(true);
    await expect(fs.readFile(path.join(projectDir, 'generated', 'ok.cpp'), 'utf8')).resolves.toBe('fine();\n');
  });

  it('reports one progress callback per document, in order, after it settles', async () => {
    const documents = [
      doc({ id: '1', type: 'simple-code-cpp', name: 'a', root: actionRoot('a();') }),
      doc({ id: '2', type: 'simple-code-rust', name: 'b', root: actionRoot('b();') }),
    ];
    const progress: { done: number; total: number; documentName: string }[] = [];
    await exportCodeProject({ projectDir, documents, onProgress: (p) => progress.push(p) });
    expect(progress).toEqual([
      { done: 1, total: 2, documentName: 'a' },
      { done: 2, total: 2, documentName: 'b' },
    ]);
  });
});
