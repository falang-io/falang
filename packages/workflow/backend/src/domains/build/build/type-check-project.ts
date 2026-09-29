// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { join } from 'node:path';
import ts from 'typescript';
import { parseCompiledMarkers, resolveMarkerLocation, type ICompileError } from '@falang/workflow-compiler';

// Real directory (this file's own), so Node-style module resolution walks upward from here to
// find the repo's real `node_modules` — and, from there, `@temporalio/workflow`'s types — the same
// way the spawned runner resolves it at runtime (see ADR 0002 (private)'s note on why `.builds`
// must live inside the node_modules-resolvable tree). Neither path needs to (or does) exist on disk;
// `createVirtualCompilerHost` below serves their content from memory.
const WORKFLOWS_VIRTUAL_PATH = join(__dirname, '__generated-workflows__.ts');
const ACTIVITIES_VIRTUAL_PATH = join(__dirname, '__generated-activities__.ts');

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  esModuleInterop: true,
  skipLibCheck: true,
  strict: true,
  noEmit: true,
  types: ['node'],
};

/** No document could be blamed for this diagnostic — a global/config-level error, one inside `activities.ts` (compiled from integration/vendor code, not a user document), or a line outside every `doc-start`/`doc-end` marker (e.g. the preamble). */
const UNATTRIBUTED_DOCUMENT_NAME = '(generated code)';

const createVirtualCompilerHost = (files: ReadonlyMap<string, string>): ts.CompilerHost => {
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const realReadFile = host.readFile.bind(host);
  const realFileExists = host.fileExists.bind(host);
  const realGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) => files.has(fileName) || realFileExists(fileName);
  host.readFile = (fileName) => (files.has(fileName) ? (files.get(fileName) as string) : realReadFile(fileName));
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    if (!files.has(fileName)) {
      return realGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    }
    return ts.createSourceFile(fileName, files.get(fileName) as string, languageVersionOrOptions, true);
  };
  return host;
};

const flattenMessage = (messageText: string | ts.DiagnosticMessageChain): string =>
  ts.flattenDiagnosticMessageText(messageText, '\n');

/** Maps one TypeScript diagnostic back to the document/node that produced the line it points at, using the `doc-start`/`icon-start` markers `workflows` was compiled with (see `parse-compiled-markers.ts`). */
const mapDiagnostic = (
  diagnostic: ts.Diagnostic,
  markers: ReturnType<typeof parseCompiledMarkers>,
): ICompileError => {
  const message = flattenMessage(diagnostic.messageText);
  if (!diagnostic.file || diagnostic.file.fileName !== WORKFLOWS_VIRTUAL_PATH || typeof diagnostic.start !== 'number') {
    return { documentId: '', documentName: UNATTRIBUTED_DOCUMENT_NAME, message };
  }

  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const location = resolveMarkerLocation(markers, line);
  const prefixedMessage = `Line ${line + 1}: ${message}`;
  if (!location.documentId) {
    return { documentId: '', documentName: UNATTRIBUTED_DOCUMENT_NAME, message: prefixedMessage };
  }
  return {
    documentId: location.documentId,
    documentName: location.documentName ?? '',
    ...(location.nodeId ? { nodeId: location.nodeId } : {}),
    message: prefixedMessage,
  };
};

/**
 * Type-checks a project's compiled `workflows`/`activities` modules with a real `ts.Program` —
 * catches real TypeScript errors (wrong argument types passed to an activity call, a
 * `function-footer` missing its `return`, …) that `tsx` never would, since the runner
 * transpiles-only at runtime and never type-checks. `workflows` is `compileProject`'s output (see
 * `compile-project-documents.ts`), whose `doc-start`/`icon-start` markers attribute each diagnostic
 * back to a document and, where possible, a specific node.
 */
export const typeCheckProject = (workflows: string, activities: string): ICompileError[] => {
  const files = new Map([
    [WORKFLOWS_VIRTUAL_PATH, workflows],
    [ACTIVITIES_VIRTUAL_PATH, activities],
  ]);
  const host = createVirtualCompilerHost(files);
  const program = ts.createProgram([WORKFLOWS_VIRTUAL_PATH, ACTIVITIES_VIRTUAL_PATH], COMPILER_OPTIONS, host);
  const markers = parseCompiledMarkers(workflows);

  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => !diagnostic.file || files.has(diagnostic.file.fileName))
    .map((diagnostic) => mapDiagnostic(diagnostic, markers));
};
