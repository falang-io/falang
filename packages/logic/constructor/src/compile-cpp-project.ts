import type { IProjectDocument } from '@falang/dto';
import { buildStructRegistry } from './struct-registry.js';
import { emitCppStructDeclarations } from './emit-cpp-struct-declarations.js';
import { buildCppSignatureLine, compileCppFunction } from './compile-cpp-function.js';
import type { ICppCompileParams, ICppFunctionSignature } from './compile-cpp-statements.js';
import { NodeCompileError } from './node-compile-error.js';
import { getFunctionSignature } from './function-signature.js';
import { cppAdapter } from './languages/cpp-adapter.js';
import { buildExternalApiRegistry } from './external-api-registry.js';
import { emitCppApiDeclarations } from './emit-cpp-api-declarations.js';

const PREAMBLE = [
  '#include <iostream>',
  '#include <sstream>',
  '#include <string>',
  '#include <vector>',
  '#include <cstdint>',
  '#include <cmath>',
  '#include <cstdlib>',
  '#include <stdexcept>',
  '#include <algorithm>',
].join('\n');

export interface ICompileCppProjectParams {
  /**
   * A project's full document set — `type === 'function'` documents are compiled to C++ function
   * definitions, `type === OBJECTS_STRUCTURE_NAME` documents contribute struct declarations;
   * anything else is skipped (matches `@falang/workflow-compiler`'s own `compileProject` posture).
   */
  readonly documents: readonly IProjectDocument[];
  /** If given, the compiled output also gets a real `int main() { <fn>(); return 0; }` entry point calling this document's function — the document must have no parameters and a `void` return. */
  readonly entryDocumentId?: string;
}

export interface ICppProjectCompileErrorEntry {
  readonly documentId: string;
  readonly documentName: string;
  readonly nodeId?: string;
  readonly message: string;
}

/** Thrown by `compileCppProject` when one or more `function` documents fail to compile; every other document's output still compiled fine (see `.partialCode`) — same "don't let one broken document hide every other" posture as `@falang/workflow-compiler`'s `ProjectCompileError`. */
export class CppProjectCompileError extends Error {
  readonly errors: readonly ICppProjectCompileErrorEntry[];
  readonly partialCode: string;

  constructor(errors: readonly ICppProjectCompileErrorEntry[], partialCode: string) {
    super(errors.map((error) => `${error.documentName} (${error.documentId}): ${error.message}`).join('\n'));
    this.name = 'CppProjectCompileError';
    this.errors = errors;
    this.partialCode = partialCode;
  }
}

/** C++ reserves `main` for the process entry point `compileCppProject` itself synthesizes when `entryDocumentId` is given — a `function` document happening to be named "main" (a very natural choice for the entry document itself) would otherwise collide with it, so it's compiled under this internal alias instead whenever a `main()` will actually be emitted. */
const RESERVED_ENTRY_POINT_NAME = 'main';
const MAIN_NAME_COLLISION_ALIAS = '__falang_main_fn';

const resolveCppFunctionName = (documentName: string, entryDocumentId?: string): string =>
  Boolean(entryDocumentId) && documentName === RESERVED_ENTRY_POINT_NAME ? MAIN_NAME_COLLISION_ALIAS : documentName;

const buildMain = (entryDocumentId: string, functionSignatures: ReadonlyMap<string, ICppFunctionSignature>): string => {
  const signature = functionSignatures.get(entryDocumentId);
  if (!signature) throw new Error(`entryDocumentId "${entryDocumentId}" does not match any function document`);
  if (signature.returnValue) {
    throw new Error(`Entry document "${entryDocumentId}" must return void to be used as a C++ program's entry point`);
  }
  return `int main() {\n  ${signature.cppName}();\n  return 0;\n}`;
};

/**
 * Compiles every `function` document in a project into one self-contained `.cpp` file (struct
 * declarations, then every function definition, then an optional `main()`) — the cpp-target
 * analogue of `@falang/workflow-compiler`'s `compileProject`. Unlike that function's two-module
 * split (workflow functions vs. Temporal activities), there's nothing here to keep separate: a
 * plain C++ program is one translation unit, so a single file is the natural shape (splitting into
 * per-document files/namespaces, the way the old app did, is deferred — see ADR 0019 (private)'s
 * "Open follow-ups").
 */
export const compileCppProject = ({ documents, entryDocumentId }: ICompileCppProjectParams): string => {
  const structRegistry = buildStructRegistry(documents);
  const apiRegistry = buildExternalApiRegistry(documents);
  const functionDocuments = documents.filter((document) => document.type === 'function');

  const functionSignatures = new Map<string, ICppFunctionSignature>();
  const prototypes: string[] = [];
  for (const document of functionDocuments) {
    if (!document.root) continue;
    const signature = getFunctionSignature(document.root);
    const cppName = resolveCppFunctionName(document.name, entryDocumentId);
    functionSignatures.set(document.id, { cppName, returnValue: signature.returnValue });
    // C++ has no hoisting — a `call-function` can target any document regardless of compile order
    // (see `@falang/workflow-compiler`'s own `compileProject`, which resolves `call-function` the
    // same order-independent way for its TS target), so every function needs a prototype declared
    // up front, ahead of every definition, not just the ones actually called before their own
    // definition appears.
    prototypes.push(
      `${buildCppSignatureLine(cppName, signature.parameters, signature.returnValue, structRegistry.structNames)};`,
    );
  }

  const params: ICppCompileParams = {
    structNames: structRegistry.structNames,
    structDefinitions: structRegistry.structDefinitions,
    functionSignatures,
    adapter: cppAdapter,
    apiEndpoints: apiRegistry.endpoints,
  };

  const errors: ICppProjectCompileErrorEntry[] = [];
  const functionBlocks: string[] = [];
  for (const document of functionDocuments) {
    try {
      if (!document.root) throw new Error(`Function document "${document.id}" has no root node`);
      const cppName = functionSignatures.get(document.id)?.cppName ?? document.name;
      functionBlocks.push(compileCppFunction(document.root, cppName, params));
    } catch (error) {
      errors.push({
        documentId: document.id,
        documentName: document.name,
        ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const structDeclarations = emitCppStructDeclarations(structRegistry.structDefinitions, structRegistry.structNames);
  const apiDeclarations = emitCppApiDeclarations(apiRegistry, structRegistry.structNames);
  const mainBlock = entryDocumentId ? buildMain(entryDocumentId, functionSignatures) : '';

  const code = [
    PREAMBLE,
    structDeclarations,
    apiDeclarations,
    prototypes.join('\n'),
    functionBlocks.join('\n\n'),
    mainBlock,
  ]
    .filter((section) => section !== '')
    .join('\n\n');

  if (errors.length > 0) throw new CppProjectCompileError(errors, code);
  return code;
};
