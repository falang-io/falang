import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { exportLogicProject, isLogicExportLanguageSupported } from './export-logic-project.js';

/** Same minimal `function` document shape `compile-cpp-project.test.ts` builds by hand. */
const functionDocument = (id: string, name: string, body: INode[]): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root: {
    id,
    name: 'function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: body },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const int32 = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

const GOOD_DOCUMENTS: IProjectDocument[] = [
  functionDocument('doc-hello', 'hello', [
    { id: 'cv', name: 'create-var', data: { name: 'x', variableType: int32, value: '1' } },
    { id: 'log', name: 'log', data: 'x is ${x}' },
  ]),
];

const BROKEN_DOCUMENTS: IProjectDocument[] = [
  functionDocument('doc-broken', 'broken', [
    { id: 'cv', name: 'create-var', data: { name: 'x', variableType: int32, value: 'undefinedVariable + 1' } },
  ]),
];

describe('exportLogicProject', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logic-export-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('writes one source file per configured target, resolving relative paths against the project dir', async () => {
    const result = await exportLogicProject({
      projectDir,
      documents: GOOD_DOCUMENTS,
      exports: [
        { language: 'cpp', path: './out/cpp' },
        { language: 'golang', path: 'out/go' },
        { language: 'rust', path: path.join(projectDir, 'abs-rust') },
        { language: 'sharp', path: './out/sharp' },
      ],
    });

    expect(result.items.map((item) => item.ok)).toEqual([true, true, true, true]);
    expect(result.items.map((item) => item.files)).toEqual([
      [path.join(projectDir, 'out', 'cpp', 'falang.cpp')],
      [path.join(projectDir, 'out', 'go', 'falang.go')],
      // Rust is a multi-file target (Contract 2/3 of ADR 0019 (private)'s "Rust target" implementation
      // notes) — one `.rs` per function/struct document plus `falang_global.rs`/`mod.rs`, order matching
      // `compileRustProject`'s own file-assembly order.
      [
        path.join(projectDir, 'abs-rust', 'hello.rs'),
        path.join(projectDir, 'abs-rust', 'falang_global.rs'),
        path.join(projectDir, 'abs-rust', 'mod.rs'),
      ],
      [path.join(projectDir, 'out', 'sharp', 'Falang.cs')],
    ]);
    expect(result.items[0]?.outputDir).toBe(path.join(projectDir, 'out', 'cpp'));

    const cpp = await fs.readFile(path.join(projectDir, 'out', 'cpp', 'falang.cpp'), 'utf8');
    expect(cpp).toContain('void hello()');
    expect(cpp).not.toContain('int main()');
    const go = await fs.readFile(path.join(projectDir, 'out', 'go', 'falang.go'), 'utf8');
    expect(go).toContain('func hello()');
    const rust = await fs.readFile(path.join(projectDir, 'abs-rust', 'hello.rs'), 'utf8');
    expect(rust).toContain('fn hello(');
    const sharp = await fs.readFile(path.join(projectDir, 'out', 'sharp', 'Falang.cs'), 'utf8');
    expect(sharp).toContain('hello()');
  });

  it('writes one .ts file per document plus _falang.ts for the ts target (Contract 4 of ADR 0019 (private))', async () => {
    const result = await exportLogicProject({
      projectDir,
      documents: GOOD_DOCUMENTS,
      exports: [{ language: 'ts', path: './out/ts' }],
    });

    expect(result.items[0]).toMatchObject({ language: 'ts', ok: true });
    expect(result.items[0]?.files.toSorted()).toEqual(
      [path.join(projectDir, 'out', 'ts', '_falang.ts'), path.join(projectDir, 'out', 'ts', 'hello.ts')].toSorted(),
    );
    const hello = await fs.readFile(path.join(projectDir, 'out', 'ts', 'hello.ts'), 'utf8');
    expect(hello).toContain('export async function hello(_params: IhelloParams): Promise<void> {');
    const falangGlobal = await fs.readFile(path.join(projectDir, 'out', 'ts', '_falang.ts'), 'utf8');
    expect(falangGlobal).toBe('export interface FalangGlobal {\n}');
  });

  it('reports compile errors per item, writes nothing for that item, and still exports the others', async () => {
    const result = await exportLogicProject({
      projectDir,
      documents: BROKEN_DOCUMENTS,
      exports: [
        { language: 'cpp', path: './out/cpp' },
        { language: 'golang', path: './out/go' },
      ],
    });

    expect(result.items.map((item) => item.ok)).toEqual([false, false]);
    for (const item of result.items) {
      expect(item.files).toEqual([]);
      expect(item.errors.length).toBeGreaterThan(0);
      expect(item.errors[0]).toMatchObject({ documentId: 'doc-broken', documentName: 'broken' });
      expect(item.errors[0]?.message).toMatch(/undefinedVariable/);
    }
    await expect(fs.access(path.join(projectDir, 'out', 'cpp', 'falang.cpp'))).rejects.toThrow();
  });

  it('keeps exporting good items when a sibling item fails', async () => {
    const result = await exportLogicProject({
      projectDir,
      documents: GOOD_DOCUMENTS,
      exports: [
        { language: 'js', path: './out/js' },
        { language: 'cpp', path: './out/cpp' },
      ],
    });

    expect(result.items[0]).toMatchObject({ language: 'js', ok: false, files: [] });
    expect(result.items[0]?.errors[0]?.message).toMatch(/not supported yet/);
    expect(result.items[1]).toMatchObject({ language: 'cpp', ok: true });
    await expect(fs.access(path.join(projectDir, 'out', 'cpp', 'falang.cpp'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(projectDir, 'out', 'js'))).rejects.toThrow();
  });

  it('turns an unwritable output path into an item error instead of throwing', async () => {
    await fs.writeFile(path.join(projectDir, 'not-a-dir'), '');
    const result = await exportLogicProject({
      projectDir,
      documents: GOOD_DOCUMENTS,
      exports: [{ language: 'cpp', path: './not-a-dir/cpp' }],
    });
    expect(result.items[0]?.ok).toBe(false);
    expect(result.items[0]?.errors[0]?.message).toMatch(/ENOTDIR|not a directory/i);
  });

  it('reports one progress callback per item, in order, after it settles', async () => {
    const progress: { done: number; total: number; language: string }[] = [];
    await exportLogicProject({
      projectDir,
      documents: GOOD_DOCUMENTS,
      exports: [
        { language: 'cpp', path: './out/cpp' },
        { language: 'golang', path: './out/go' },
      ],
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toEqual([
      { done: 1, total: 2, language: 'cpp', path: './out/cpp' },
      { done: 2, total: 2, language: 'golang', path: './out/go' },
    ]);
  });

  it('knows which languages have a project-level compiler', () => {
    expect(
      ['cpp', 'golang', 'rust', 'sharp', 'ts'].map((lang) => isLogicExportLanguageSupported(lang as 'cpp')),
    ).toEqual([true, true, true, true, true]);
    expect(isLogicExportLanguageSupported('js')).toBe(false);
  });
});
