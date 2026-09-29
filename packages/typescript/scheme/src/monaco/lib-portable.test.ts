import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { libPortable } from './lib-portable.js';

const LIB_PATH = '/virtual/lib-portable.d.ts';
const SOURCE_PATH = '/virtual/source.ts';

/** Mirrors `get-monaco.ts`'s own `noLib`/`strict` compiler options closely enough to catch the same diagnostics monaco's TS worker would. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  noLib: true,
  strict: true,
  noEmit: true,
};

/** Real, type-checked diagnostics against `libPortable` for one source snippet — same virtual-host technique `@falang/logic-constructor`'s `compile-expression.ts` uses for its own lib. */
const diagnosticsFor = (sourceText: string): readonly ts.Diagnostic[] => {
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const realGetSourceFile = host.getSourceFile.bind(host);
  const realFileExists = host.fileExists.bind(host);
  const realReadFile = host.readFile.bind(host);

  host.fileExists = (fileName) => fileName === LIB_PATH || fileName === SOURCE_PATH || realFileExists(fileName);
  host.readFile = (fileName) => {
    if (fileName === LIB_PATH) return libPortable;
    if (fileName === SOURCE_PATH) return sourceText;
    return realReadFile(fileName);
  };
  host.getSourceFile = (fileName, options, onError, shouldCreateNewSourceFile) => {
    if (fileName === LIB_PATH) return ts.createSourceFile(fileName, libPortable, options, true);
    if (fileName === SOURCE_PATH) return ts.createSourceFile(fileName, sourceText, options, true);
    return realGetSourceFile(fileName, options, onError, shouldCreateNewSourceFile);
  };
  host.getDefaultLibFileName = () => LIB_PATH;

  const program = ts.createProgram([SOURCE_PATH, LIB_PATH], COMPILER_OPTIONS, host);
  return ts.getPreEmitDiagnostics(program);
};

describe('libPortable', () => {
  it('type-checks the whole surface @falang/logic-constructor actually supports, with no diagnostics', () => {
    const diagnostics = diagnosticsFor(`
      declare let x: number[];
      declare let s: string;
      interface Point { x: number; y: number; }
      declare let p: Point;

      const a = x.length + s.length;
      const b = Math.pow(2, 3) + Math.abs(-1) + Math.min(1, 2) + Math.max(1, 2);
      const c = Math.sqrt(4) + Math.floor(1.5) + Math.ceil(1.5) + Math.round(1.5) + Math.random();
      const d: number[] = [1, 2, 3];
      const e = d[0];
      d[0] = 5;
      const f = x.length > 0 ? 1 : 2;
      const g = p.x + p.y;
    `);
    expect(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual(
      [],
    );
  });

  it('rejects array/string methods no adapter supports (structural DSL node kinds instead, never raw expression syntax)', () => {
    const diagnostics = diagnosticsFor(`
      declare let x: number[];
      declare let s: string;
      x.push(1);
      s.toUpperCase();
    `);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('rejects Math methods outside the 9-method whitelist every adapter shares', () => {
    const diagnostics = diagnosticsFor(`Math.sin(1);`);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('rejects JS-specific globals no target expression walker can ever emit', () => {
    for (const snippet of ['JSON.stringify(1);', 'Promise.resolve(1);', 'new RegExp("a");', 'Symbol();']) {
      expect(diagnosticsFor(snippet).length, snippet).toBeGreaterThan(0);
    }
  });
});
