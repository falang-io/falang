import ts from 'typescript';
import { parseCompiledMarkers, resolveMarkerLocation, type ICompileError } from '@falang/workflow-compiler';

/**
 * Module specifiers the compiler itself emits into generated `workflows.ts`/`activities.ts`
 * (derived from the real output: `compile-project.ts`'s `@temporalio/workflow` preamble, the log
 * activity's `@temporalio/activity`, and every vendor's `sharedActivityCode` — pinned by
 * `assert-safe-generated-modules.test.ts`, which runs the checker over every registered
 * integration's activity code). Anything else — a relative path, an absolute path, a `?raw`/`!loader`
 * webpack specifier, another package — is user text that escaped its field, because the build's
 * module resolver (tsc and webpack, both in the backend's process) would otherwise read it from the
 * backend's own filesystem. See the security audit's P0-7.
 */
const ALLOWED_EXACT_SPECIFIERS: ReadonlySet<string> = new Set([
  '@temporalio/workflow',
  '@temporalio/activity',
  // Lazily imported by the SQL vendors' `sharedActivityCode`.
  'pg',
  'mysql2/promise',
  'node:sqlite',
]);

/** Every vendor package the registry ships (`@falang/workflow-integrations-<vendor>`, plus `-common`/`-files`/`-sql-common`). */
const ALLOWED_SPECIFIER_PREFIXES: readonly string[] = ['@falang/workflow-integrations-'];

export const isAllowedModuleSpecifier = (specifier: string): boolean =>
  ALLOWED_EXACT_SPECIFIERS.has(specifier) || ALLOWED_SPECIFIER_PREFIXES.some((prefix) => specifier.startsWith(prefix));

// A triple-slash directive in the middle of a file is ignored by tsc (but not necessarily by
// every other tool); one at the top makes tsc read an arbitrary path. Reject both, wherever.
const TRIPLE_SLASH_DIRECTIVE = /^\s*\/\/\/\s*</m;
const FORBIDDEN_IDENTIFIER = /^(?:require|__non_webpack_require__|__webpack_[a-z_]+)$/;

interface IViolation {
  readonly position: number;
  readonly message: string;
}

const describeSpecifier = (node: ts.Expression | null | undefined): string =>
  node && ts.isStringLiteralLike(node) ? `'${node.text}'` : 'a non-literal expression';

const checkSpecifier = (node: ts.Expression | null | undefined, what: string, violations: IViolation[], position: number): void => {
  if (!node || !ts.isStringLiteralLike(node)) {
    violations.push({ position, message: `${what} must name a module with a string literal (got ${describeSpecifier(node)})` });
    return;
  }
  if (!isAllowedModuleSpecifier(node.text)) {
    violations.push({ position, message: `${what} of '${node.text}' is not allowed in generated code` });
  }
};

const visit = (node: ts.Node, violations: IViolation[]): void => {
  const position = node.getStart();
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    checkSpecifier(node.moduleSpecifier, ts.isImportDeclaration(node) ? 'import' : 're-export', violations, position);
  } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    violations.push({ position, message: "'import x = require(...)' is not allowed in generated code" });
  } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    // `import('pg')`-style lazy loading is emitted by the SQL vendors; only an allowlisted literal passes.
    if (node.arguments.length === 1) {
      checkSpecifier(node.arguments[0], 'dynamic import()', violations, position);
    } else {
      violations.push({ position, message: 'dynamic import() with options is not allowed in generated code' });
    }
  } else if (ts.isImportTypeNode(node)) {
    const literal = ts.isLiteralTypeNode(node.argument) ? (node.argument.literal as ts.Expression) : null;
    checkSpecifier(literal, "type-level import('…')", violations, position);
  } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
    violations.push({ position, message: "'import.meta' is not allowed in generated code" });
  } else if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIER.test(node.text)) {
    violations.push({ position, message: `'${node.text}' is not allowed in generated code` });
  }
  ts.forEachChild(node, (child) => visit(child, violations));
};

const findViolations = (fileName: string, source: string): { sourceFile: ts.SourceFile; violations: IViolation[] } => {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);
  const violations: IViolation[] = [];
  visit(sourceFile, violations);
  const directive = TRIPLE_SLASH_DIRECTIVE.exec(source);
  if (directive) {
    violations.push({ position: directive.index, message: "'/// <…>' directives are not allowed in generated code" });
  }
  return { sourceFile, violations };
};

/**
 * Rejects a generated module that loads anything the compiler itself would never emit — the
 * user-controlled fields of a project (expressions, message text, vendor fields) are spliced into
 * code, so a value like `0;\n}\nimport x from '../../.builds/other/…'` can otherwise break out of its
 * statement and make the backend's type-checker/bundler read arbitrary files. Checks the finished
 * module (not the fragments), so every source field is covered at once. Returns one error per
 * violation, attributed to its document/node through the `doc-start`/`icon-start` markers in
 * `workflows` (activities are vendor code and unattributed).
 */
export const assertSafeGeneratedModules = (workflows: string, activities: string): ICompileError[] => {
  const markers = parseCompiledMarkers(workflows);
  const errors: ICompileError[] = [];

  const workflowsResult = findViolations('workflows.ts', workflows);
  for (const violation of workflowsResult.violations) {
    const { line } = workflowsResult.sourceFile.getLineAndCharacterOfPosition(violation.position);
    const location = resolveMarkerLocation(markers, line);
    errors.push({
      documentId: location.documentId ?? '',
      documentName: location.documentId ? (location.documentName ?? '') : '(generated code)',
      ...(location.nodeId ? { nodeId: location.nodeId } : {}),
      message: `Line ${line + 1}: ${violation.message}`,
    });
  }

  for (const violation of findViolations('activities.ts', activities).violations) {
    errors.push({ documentId: '', documentName: '(generated code)', message: `activities: ${violation.message}` });
  }
  return errors;
};
