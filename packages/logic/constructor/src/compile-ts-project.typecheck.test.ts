// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta (same posture as compile-expression.ts's own VIRTUAL_PATH).
import * as path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { IProjectDocument } from '@falang/dto';
import { compileTsProject } from './compile-ts-project.js';

/**
 * A real, hand-authored project (the user's own "snake" example, converted from the old app's format
 * — see ADR 0019 (private)'s "TypeScript target" implementation notes) copied into this fixture so
 * the test is self-contained, rather than reading `/home/serginho/Work/example-snake/documents` off
 * disk at test time. Fixed one real bug found in the source project along the way: three documents
 * (`isGameOver`, `getNewFoodPoint`, `main`) carried leftover `and`/`or` operators from the old app's own
 * mathjs-based expression language — never valid TypeScript — that the v2-to-v3 project converter
 * copied verbatim into the `data` string instead of translating (ADR 0019 (private) decided
 * expression fields are real TypeScript, not a new grammar, so this was always meant to be plain
 * `&&`/`||`). Fixed only in this fixture copy, not in the user's own real project — see this task's
 * final report for the bug write-up.
 */
const FIXTURE_DOCUMENTS_DIR = path.join(__dirname, '__fixtures__', 'snake', 'documents');

const loadSnakeDocuments = (): readonly IProjectDocument[] =>
  readdirSync(FIXTURE_DOCUMENTS_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .map(
      (fileName) => JSON.parse(readFileSync(path.join(FIXTURE_DOCUMENTS_DIR, fileName), 'utf8')) as IProjectDocument,
    );

/** Mirrors the real host project's own `code/ts/tsconfig.json` (`strict: true`, `moduleResolution: "Node"`, `esModuleInterop: true`) closely enough to catch the same class of error a real `tsc --noEmit` there would. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  strict: true,
  esModuleInterop: true,
  noEmit: true,
  skipLibCheck: true,
};

/** A directory that doesn't need to exist on disk (real path, so Node-style resolution walks upward to a real `node_modules` for lib files — same technique as `compile-expression.ts`'s `createVirtualCompilerHost`), holding every generated file in memory under it. */
const VIRTUAL_PROJECT_DIR = path.join(__dirname, '__ts_project_fixture__');

const createInMemoryCompilerHost = (files: Readonly<Record<string, string>>): ts.CompilerHost => {
  const virtualFiles = new Map(
    Object.entries(files).map(([fileName, content]) => [path.join(VIRTUAL_PROJECT_DIR, fileName), content] as const),
  );
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const realFileExists = host.fileExists.bind(host);
  const realReadFile = host.readFile.bind(host);
  const realGetSourceFile = host.getSourceFile.bind(host);
  const realDirectoryExists = host.directoryExists?.bind(host);

  host.fileExists = (fileName) => virtualFiles.has(fileName) || realFileExists(fileName);
  host.readFile = (fileName) => virtualFiles.get(fileName) ?? realReadFile(fileName);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const content = virtualFiles.get(fileName);
    // oxlint-disable-next-line no-undefined -- `Map.get` genuinely returns `T | undefined`; `no-typeof-undefined` (the alternative this codebase otherwise prefers) explicitly wants a direct `=== undefined` comparison instead, so the two rules disagree on this exact case — same tension `default-value-expression.ts`'s own disable comment already documents.
    if (content !== undefined) return ts.createSourceFile(fileName, content, languageVersionOrOptions, true);
    return realGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
  };
  // Node-style module resolution (`./State` with no extension) probes `directoryExists` on the
  // *containing* directory before it ever gets to `fileExists` — `VIRTUAL_PROJECT_DIR` doesn't exist on
  // the real filesystem at all, so without this override every relative import inside the fixture fails
  // resolution before `fileExists`'s own virtual-file check is ever consulted.
  host.directoryExists = (dirName) => dirName === VIRTUAL_PROJECT_DIR || Boolean(realDirectoryExists?.(dirName));
  return host;
};

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]): string[] =>
  diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    // oxlint-disable-next-line no-undefined -- ts.Diagnostic.start is genuinely `number | undefined`; see the disable comment a few lines above for why a direct comparison (not `typeof`) is used here.
    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `${diagnostic.file.fileName}:${line + 1}:${character + 1} - ${message}`;
    }
    return message;
  });

describe('compileTsProject: real-project type-check (ADR 0019 (private))', () => {
  // A real `ts.createProgram` over 13 files plus the full `lib.esnext.d.ts` closure is legitimately
  // heavier than this package's other tests (~15s standalone; observed timing out against Vitest's
  // default 30s budget when the full package suite runs everything concurrently) — a longer explicit
  // timeout, not a `compileTsProject` performance problem (the compile step itself is fast; `tsc`'s own
  // type-check is what dominates, same "several megabytes of lib declarations" cost
  // `compile-expression.ts`'s own doc comment already flags for a *single*-expression program, here
  // paid once for the whole project instead of once per expression).
  it("compiles the snake project's every document with zero tsc --strict diagnostics", () => {
    const documents = loadSnakeDocuments();
    const { files } = compileTsProject({ documents });

    // Sanity-checks the fixture itself compiled into the expected file set before asserting on tsc
    // diagnostics — a silently-empty `files` map would otherwise make this test vacuously pass.
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['_falang.ts', 'main.ts', 'State.ts', 'GameApi.ts', 'getNextPoint.ts', 'isGameOver.ts']),
    );

    const host = createInMemoryCompilerHost(files);
    const rootFileNames = Object.keys(files).map((fileName) => path.join(VIRTUAL_PROJECT_DIR, fileName));
    const program = ts.createProgram(rootFileNames, COMPILER_OPTIONS, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => Boolean(diagnostic.file));

    expect(formatDiagnostics(diagnostics)).toEqual([]);
  }, 60_000);
});
