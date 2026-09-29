// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { join } from 'node:path';
import ts from 'typescript';
import type { TVariableInfo } from '@falang/typescript-dto';
import { variableInfoToTsType } from '@falang/typescript-dto';
import type { TExportLanguage } from '@falang/logic-dto';
import { IMPLEMENTED_LANGUAGES } from './implemented-languages.js';
import type { ILanguageAdapter } from './language-adapter.js';
import { UnsupportedConstructError } from './language-adapter.js';
import { emitPortableExpression } from './walk-expression.js';
import { cppAdapter } from './languages/cpp-adapter.js';
import { golangAdapter } from './languages/golang-adapter.js';
import { rustAdapter } from './languages/rust-adapter.js';
import { sharpAdapter } from './languages/sharp-adapter.js';
import type { IStructDefinition } from './struct-definition.js';

export interface ICompileExpressionParams {
  readonly expression: string;
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  readonly target: TExportLanguage;
  readonly structNames?: Map<string, string>;
  /**
   * Struct bodies for every struct id reachable from `structNames`/`scope` — without this, a struct
   * scope variable type-checks as its bare interface name with no declared members (TS error:
   * "Cannot find name"), since `structNames` alone only supplies the *name* a struct id should
   * render as. Passing this closes the gap ADR 0019 (private)'s Implementation notes flagged
   * ("`compileExpression` has no type registry of its own yet to emit struct bodies").
   */
  readonly structDefinitions?: ReadonlyMap<string, IStructDefinition>;
}

export interface ICompileExpressionSuccess {
  readonly ok: true;
  readonly code: string;
}

export interface ICompileExpressionFailure {
  readonly ok: false;
  readonly diagnostics: readonly string[];
}

export type TCompileExpressionResult = ICompileExpressionSuccess | ICompileExpressionFailure;

/** Every target besides `ts`/`js` (identity / `ts.transpileModule`, see below) goes through `emitPortableExpression` with its own `ILanguageAdapter` — adding a new genuinely-different-syntax target is: implement an adapter (`languages/<lang>-adapter.ts`), add it here, add it to `IMPLEMENTED_LANGUAGES`. Nothing in `compileExpression` itself changes. */
const LANGUAGE_ADAPTERS: Partial<Record<TExportLanguage, ILanguageAdapter>> = {
  cpp: cppAdapter,
  golang: golangAdapter,
  rust: rustAdapter,
  sharp: sharpAdapter,
};

const EXPR_DECLARATION_NAME = '__expr__';

const VIRTUAL_PATH = join(__dirname, '__logic_expression__.ts');

const TYPE_CHECK_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ['lib.esnext.d.ts'],
  strict: true,
  noEmit: true,
  types: [],
};

/**
 * Parsed `lib.*.d.ts` source files, shared by every `ts.Program` this module builds. Each program is
 * otherwise built from scratch — and one is built per *expression*, so a single function body compiles
 * dozens — while re-parsing several megabytes of lib declarations dominated the cost of every one of
 * them (this is what pushed this package's own unit tests past Vitest's default 5s per-test timeout once
 * the fourth target's tests joined the suite). Caching them is the same technique TypeScript's own
 * `LanguageService` uses via a `DocumentRegistry`: safe here because `TYPE_CHECK_COMPILER_OPTIONS` is a
 * module constant (every program parses these files with identical settings), the lib files never change
 * on disk within a process, and a `SourceFile`'s binder/symbol state is keyed per-checker, not stored on
 * the shared nodes. Only the virtual expression file itself is re-created per call, never cached.
 */
const libSourceFileCache = new Map<string, ts.SourceFile>();

/** Real path (this file's own directory), so Node-style module resolution can walk upward to a real `node_modules` for lib files — nothing needs to exist on disk at `VIRTUAL_PATH` itself, `createVirtualCompilerHost` serves its content from memory. Same technique as `workflow/backend`'s `type-check-project.ts`. */
const createVirtualCompilerHost = (fileText: string): ts.CompilerHost => {
  const host = ts.createCompilerHost(TYPE_CHECK_COMPILER_OPTIONS);
  const realReadFile = host.readFile.bind(host);
  const realFileExists = host.fileExists.bind(host);
  const realGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) => fileName === VIRTUAL_PATH || realFileExists(fileName);
  host.readFile = (fileName) => (fileName === VIRTUAL_PATH ? fileText : realReadFile(fileName));
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    if (fileName === VIRTUAL_PATH) return ts.createSourceFile(fileName, fileText, languageVersionOrOptions, true);
    const cached = libSourceFileCache.get(fileName);
    if (cached) return cached;
    const sourceFile = realGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    if (sourceFile) libSourceFileCache.set(fileName, sourceFile);
    return sourceFile;
  };
  return host;
};

/** One `interface <Name> { prop: <tsType>; ... }` per struct — order is irrelevant to TS (interfaces may reference each other in any order), unlike `emitCppStructDeclarations`'s cpp output. */
const buildStructInterfaces = (
  structDefinitions: ReadonlyMap<string, IStructDefinition>,
  structNames: Map<string, string>,
): string =>
  [...structDefinitions.values()]
    .map((definition) => {
      const properties = Object.entries(definition.properties)
        .map(([propertyName, propertyType]) => `  ${propertyName}: ${variableInfoToTsType(propertyType, structNames)};`)
        .join('\n');
      return `interface ${definition.name} {\n${properties}\n}`;
    })
    .join('\n');

export const buildVirtualFileText = (
  expression: string,
  scope: Readonly<Record<string, TVariableInfo>>,
  structNames: Map<string, string>,
  structDefinitions: ReadonlyMap<string, IStructDefinition>,
  extraDeclarations: readonly string[] = [],
): string => {
  const interfaces = buildStructInterfaces(structDefinitions, structNames);
  // `declare let`, not `declare const` — a scope entry models a statement-level variable (created by
  // `create-var`, a function parameter, a loop variable, …), which the node model allows a later
  // `action` node to reassign (e.g. `x = x + 1`) or mutate a property of (e.g. `x.z = 10`); `const`
  // would reject the former with a spurious "Cannot assign to 'x' because it is a constant."
  const declarations = Object.entries(scope)
    .map(([name, type]) => `declare let ${name}: ${variableInfoToTsType(type, structNames)};`)
    .join('\n');
  const extra = extraDeclarations.join('\n');
  return `${interfaces}\n${extra}\n${declarations}\nexport const ${EXPR_DECLARATION_NAME} = (\n${expression}\n);\n`;
};

/** Builds a real, type-checked `ts.Program` for the expression (wrapped with `declare let`s for every scope variable) — catches undeclared identifiers and type mismatches the same way the Monaco editor's hidden-scope prefix does at edit time, just outside the browser. Reused for every target: `ts`/`js` only need the diagnostics, an AST-walking target (`cpp`, …) also needs the checked `sourceFile`/`TypeChecker` this returns. */
export const createCheckedProgram = (fileText: string): { program: ts.Program; sourceFile: ts.SourceFile } => {
  const host = createVirtualCompilerHost(fileText);
  const program = ts.createProgram([VIRTUAL_PATH], TYPE_CHECK_COMPILER_OPTIONS, host);
  const sourceFile = program.getSourceFile(VIRTUAL_PATH);
  if (!sourceFile) throw new Error('Failed to parse the virtual expression file');
  return { program, sourceFile };
};

export const getDiagnosticMessages = (program: ts.Program): string[] =>
  ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => !diagnostic.file || diagnostic.file.fileName === VIRTUAL_PATH)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

/** Finds `__expr__`'s initializer in the checked source file, unwrapping the one paren layer `buildVirtualFileText` added around it so adapters don't emit a redundant outer `(...)`. */
export const findExprInitializer = (sourceFile: ts.SourceFile): ts.Expression => {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === EXPR_DECLARATION_NAME &&
        declaration.initializer
      ) {
        const { initializer } = declaration;
        return ts.isParenthesizedExpression(initializer) ? initializer.expression : initializer;
      }
    }
  }
  throw new Error(`${EXPR_DECLARATION_NAME} declaration not found in the virtual expression file`);
};

/** `ts` target is identity — the expression is already valid TypeScript, matching `@falang/workflow-compiler`'s own approach of embedding user expressions verbatim. */
const emitTs = (expression: string): string => expression;

/** `js` target only needs TypeScript-only syntax (type assertions, non-null assertions, generic type arguments, …) erased — the runtime semantics of a portable expression are already plain JS, so this needs no per-construct mapping table, unlike a genuinely different-syntax target (C++/Go/Rust/C#). */
const emitJs = (expression: string): string => {
  const { outputText } = ts.transpileModule(`(\n${expression}\n);`, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
  });
  // `transpileModule` prepends a `"use strict";` prologue regardless of `noImplicitUseStrict` when
  // it can't prove the surrounding file is already a module — irrelevant here, we only want the
  // expression's own text back out.
  const withoutUseStrict = outputText.replace(/^"use strict";\s*/, '');
  const trimmed = withoutUseStrict.trim().replace(/;$/, '');
  // Strip the single outer-parenthesis wrapper this function itself added above, needed to keep
  // the transpiled text a valid *expression statement* even for object/function literals.
  return trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed.slice(1, -1) : trimmed;
};

export interface ICompileExpressionWithAdapterParams {
  readonly expression: string;
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  readonly adapter: ILanguageAdapter;
  readonly structNames?: Map<string, string>;
  readonly structDefinitions?: ReadonlyMap<string, IStructDefinition>;
  /**
   * Raw ambient TS declaration lines (e.g. `declare function pinMode(pin: number, mode: number): void;`)
   * prepended to the virtual type-check file alongside the scope's own `declare let`s — for globals that
   * aren't scope variables at all (a target platform's builtin API), which `scope`/`structNames` have no
   * way to express. Generic on purpose: this package has no opinion on what a caller declares here.
   */
  readonly extraDeclarations?: readonly string[];
}

/**
 * The adapter-driven half of `compileExpression`, split out so a caller outside this package (or
 * outside `TExportLanguage`'s fixed target list entirely) can compile a portable expression against
 * its own `ILanguageAdapter` without this package ever needing to know that target's name — e.g.
 * `packages/desktop/app-arduino` builds its own Arduino-specific adapter (a wrapper over `cppAdapter`
 * with an extra builtin-call whitelist) and calls this directly, keeping this package product-agnostic.
 * `compileExpression` itself is just this function plus the `ts`/`js`/`TExportLanguage` special-casing.
 * Also the single place that builds the `numericContext` `emitPortableExpression` needs for automatic
 * numeric widening (ADR 0019 (private)'s numeric-coercion follow-up) — every adapter-based caller
 * gets it "for free", including a target this package has never heard of.
 */
export const compileExpressionWithAdapter = ({
  expression,
  scope,
  adapter,
  structNames = new Map(),
  structDefinitions = new Map(),
  extraDeclarations = [],
}: ICompileExpressionWithAdapterParams): TCompileExpressionResult => {
  const fileText = buildVirtualFileText(expression, scope, structNames, structDefinitions, extraDeclarations);
  const { program, sourceFile } = createCheckedProgram(fileText);
  const diagnostics = getDiagnosticMessages(program);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  try {
    const exprNode = findExprInitializer(sourceFile);
    const numericContext = { scope, structDefinitions };
    const code = emitPortableExpression(exprNode, sourceFile, program.getTypeChecker(), adapter, numericContext);
    return { ok: true, code };
  } catch (error) {
    if (error instanceof UnsupportedConstructError) {
      return { ok: false, diagnostics: [error.message] };
    }
    throw error;
  }
};

export const compileExpression = ({
  expression,
  scope,
  target,
  structNames = new Map(),
  structDefinitions = new Map(),
}: ICompileExpressionParams): TCompileExpressionResult => {
  if (!IMPLEMENTED_LANGUAGES.includes(target)) {
    throw new Error(
      `Target language not implemented yet: ${target} (implemented: ${IMPLEMENTED_LANGUAGES.join(', ')})`,
    );
  }

  if (target === 'ts' || target === 'js') {
    const fileText = buildVirtualFileText(expression, scope, structNames, structDefinitions);
    const { program } = createCheckedProgram(fileText);
    const diagnostics = getDiagnosticMessages(program);
    if (diagnostics.length > 0) {
      return { ok: false, diagnostics };
    }
    return { ok: true, code: target === 'ts' ? emitTs(expression) : emitJs(expression) };
  }

  const adapter = LANGUAGE_ADAPTERS[target];
  if (!adapter) {
    throw new Error(`Target language not implemented yet: ${target}`);
  }
  return compileExpressionWithAdapter({ expression, scope, adapter, structNames, structDefinitions });
};
