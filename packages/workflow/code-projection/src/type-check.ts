// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { ICodeDiagnostic } from '@falang/code-projection';
import ts from 'typescript';

export const PROJECT_ROOT = '/falang-project';

const COMPILER_OPTIONS: ts.CompilerOptions = {
  lib: ['lib.es2022.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

/** Lib `.d.ts` files never change: parsed once per process, shared by every check. */
const libCache = new Map<string, ts.SourceFile>();
let baseHost: ts.CompilerHost | undefined;

const createHost = (files: ReadonlyMap<string, string>): ts.CompilerHost => {
  baseHost ??= ts.createCompilerHost(COMPILER_OPTIONS);
  const base = baseHost;
  return {
    ...base,
    fileExists: (fileName) => files.has(fileName) || base.fileExists(fileName),
    getSourceFile: (fileName, languageVersion) => {
      const text = files.get(fileName);
      if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TS);
      let cached = libCache.get(fileName);
      if (!cached) {
        cached = base.getSourceFile(fileName, languageVersion);
        if (cached) libCache.set(fileName, cached);
      }
      return cached;
    },
    readFile: (fileName) => files.get(fileName) ?? base.readFile(fileName),
    writeFile: () => {},
  };
};

export interface ITypeCheckResult {
  readonly diagnostics: readonly ICodeDiagnostic[];
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
  readonly checker: ts.TypeChecker;
}

/**
 * Type-checks one projected file against the project's generated declarations in an in-memory `ts.Program` (no disk,
 * no emit; lib files cached). `files` maps agent-facing paths (`functions/x.ts`, `vendors.d.ts`, …) to text;
 * `target` is the file to report on. Diagnostics outside `target` (generated files) are dropped.
 */
export const typeCheckFile = (
  files: ReadonlyMap<string, string>,
  target: string,
  options: { readonly ignoreCodes?: ReadonlySet<number> } = {},
): ITypeCheckResult => {
  const absolute = new Map([...files].map(([path, text]) => [`${PROJECT_ROOT}/${path}`, text]));
  const program = ts.createProgram({
    host: createHost(absolute),
    options: COMPILER_OPTIONS,
    rootNames: [...absolute.keys()],
  });
  const source = program.getSourceFile(`${PROJECT_ROOT}/${target}`);
  if (!source) throw new Error(`No source for ${target}`);
  const raw = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
  const diagnostics = raw
    .filter((diagnostic) => !options.ignoreCodes?.has(diagnostic.code))
    .map((diagnostic) => {
      const start = diagnostic.start ?? 0;
      const { line, character } = source.getLineAndCharacterOfPosition(start);
      return {
        column: character + 1,
        file: target,
        line: line + 1,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      };
    });
  return { checker: program.getTypeChecker(), diagnostics, program, source };
};

/** The checker's view of an unannotated declaration's type, widened (`5` → `number`), as type text. */
export const inferredTypeText = (checker: ts.TypeChecker, declaration: ts.VariableDeclaration): string => {
  const type = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(declaration.name));
  return checker.typeToString(
    type,
    declaration,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
  );
};
