import type { IProjectDocument } from '@falang/dto';
import { EXTERNAL_API_STRUCTURE_NAME } from '@falang/typescript-dto';
import { buildStructRegistry, type IStructRegistry } from './struct-registry.js';
import { buildExternalApiRegistry, type IExternalApiRegistry } from './external-api-registry.js';
import { compileTsFunction } from './compile-ts-function.js';
import { emitTsStructDeclarations } from './emit-ts-struct-declarations.js';
import { emitTsApiDeclarations, type ITsApiGroup } from './emit-ts-api-declarations.js';
import type { ITsApiEndpoint, ITsCompileParams, ITsFunctionSignature } from './ts-statement-context.js';
import { NodeCompileError } from './node-compile-error.js';
import { getFunctionSignature } from './function-signature.js';
import type { ICompiledProjectFiles } from './compiled-project-files.js';
import type { IStructDefinition } from './struct-definition.js';

export interface ICompileTsProjectParams {
  /** A project's full document set — `type === 'function'` documents compile to one `.ts` file each, `type === OBJECTS_STRUCTURE_NAME` documents contribute one `.ts` file of struct interfaces each, `type === EXTERNAL_API_STRUCTURE_NAME` documents contribute one `.ts` file of API interfaces each; anything else is skipped, same posture as `compileGoProject`. */
  readonly documents: readonly IProjectDocument[];
  /**
   * Accepted for signature parity with the single-file targets (`compileGoProject`/`compileCppProject`
   * both synthesize a real runnable `func main()`/`int main()` entry point from this) — deliberately
   * unused here. A multi-file TS target's output is a library other code imports (Contract 4's own
   * reference `code/ts/src/index.ts` calls `main(...)` directly, passing its own `config`/
   * `_falangGlobal`), not a standalone runnable program, so there is nothing to synthesize: the entry
   * document's own generated `<DocName>.ts` file already is the entry point.
   */
  readonly entryDocumentId?: string;
}

export interface ITsProjectCompileErrorEntry {
  readonly documentId: string;
  readonly documentName: string;
  readonly nodeId?: string;
  readonly message: string;
}

/** Same "don't let one broken document hide every other" posture as `GoProjectCompileError` — `partialFiles` (not `partialCode`, see `compiled-project-files.ts`) holds every file that *did* compile, including every struct/API declarations file and every function document that didn't error. */
export class TsProjectCompileError extends Error {
  readonly errors: readonly ITsProjectCompileErrorEntry[];
  readonly partialFiles: ICompiledProjectFiles;

  constructor(errors: readonly ITsProjectCompileErrorEntry[], partialFiles: ICompiledProjectFiles) {
    super(errors.map((error) => `${error.documentName} (${error.documentId}): ${error.message}`).join('\n'));
    this.name = 'TsProjectCompileError';
    this.errors = errors;
    this.partialFiles = partialFiles;
  }
}

const FALANG_GLOBAL_FILE_NAME = '_falang';

/** Joins non-empty sections with a blank line between them, dropping any empty section — the multi-file target's analogue of `compileGoProject`'s own `[...].filter((section) => section !== '').join('\n\n')`. */
const joinSections = (...sections: readonly string[]): string =>
  sections.filter((section) => section !== '').join('\n\n');

/** Escapes `word` for embedding in a `\b<word>\b` regex, then caches the compiled regex — `buildStructImportLines`/`buildFunctionImportLines` run this once per (struct-or-function name) per generated file, so caching avoids recompiling the same handful of patterns across every document. */
const wordBoundaryRegexCache = new Map<string, RegExp>();
const containsWholeWord = (text: string, word: string): boolean => {
  let pattern = wordBoundaryRegexCache.get(word);
  if (!pattern) {
    pattern = new RegExp(String.raw`\b${word.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}\b`);
    wordBoundaryRegexCache.set(word, pattern);
  }
  return pattern.test(text);
};

/**
 * Builds one `import { Name } from './OwnerDoc';` line per struct interface referenced by `bodyText`
 * whose owning document differs from `currentDocumentId` — a project-wide, single generic import
 * mechanism used for every generated file (function/struct/API), a deliberate simplification over
 * precise per-field dependency tracking: scanning the *already-generated* text for a known interface
 * name as a whole word is the same "cheap substring scan over the compiled output" trick
 * `compile-go-project.ts` already uses to decide whether `fmt`/`math` need importing.
 */
const buildStructImportLines = (
  bodyText: string,
  currentDocumentId: string,
  structRegistry: IStructRegistry,
): readonly string[] => {
  const lines = new Set<string>();
  for (const [structId, name] of structRegistry.structNames) {
    const ownerDocumentId = structRegistry.structDocumentId.get(structId);
    if (!ownerDocumentId || ownerDocumentId === currentDocumentId) continue;
    if (!containsWholeWord(bodyText, name)) continue;
    const ownerDocumentName = structRegistry.structDocumentName.get(structId);
    if (!ownerDocumentName) continue;
    lines.add(`import { ${name} } from './${ownerDocumentName}';`);
  }
  return [...lines].toSorted();
};

/** Same scanning mechanism as `buildStructImportLines`, for a function document's own `call-function` references to another function document. */
const buildFunctionImportLines = (
  bodyText: string,
  currentDocumentId: string,
  functionSignatures: ReadonlyMap<string, ITsFunctionSignature>,
  documentNameById: ReadonlyMap<string, string>,
): readonly string[] => {
  const lines = new Set<string>();
  for (const [documentId, signature] of functionSignatures) {
    if (documentId === currentDocumentId) continue;
    if (!containsWholeWord(bodyText, signature.tsName)) continue;
    const ownerDocumentName = documentNameById.get(documentId);
    if (!ownerDocumentName) continue;
    lines.add(`import { ${signature.tsName} } from './${ownerDocumentName}';`);
  }
  return [...lines].toSorted();
};

/**
 * `_falang.ts` (Contract 4): `Apis`/`FalangGlobal`, importing one interface per `external-api-structure`
 * document. A project with no API documents at all still gets a `FalangGlobal` (every function document
 * unconditionally imports it), just with no `apis` field — same "only emit what's actually configured"
 * posture as the old app's own `TypeScriptLogicBuilder.buildGlobal()` (`if (groupedApis.size) { ... }`).
 */
const buildFalangGlobalFile = (apiDocuments: readonly IProjectDocument[]): string => {
  if (apiDocuments.length === 0) {
    return 'export interface FalangGlobal {\n}';
  }
  const sortedDocuments = apiDocuments.toSorted((a, b) => a.name.localeCompare(b.name));
  const imports = sortedDocuments.map((document) => `import { ${document.name} } from './${document.name}';`);
  const apisInterface = `export interface Apis {\n${sortedDocuments.map((document) => `  ${document.name}: ${document.name};`).join('\n')}\n}`;
  const falangGlobalInterface = 'export interface FalangGlobal {\n  apis: Apis;\n}';
  return joinSections(imports.join('\n'), apisInterface, falangGlobalInterface);
};

const buildTsApiEndpoints = (apiRegistry: IExternalApiRegistry): ReadonlyMap<string, ITsApiEndpoint> => {
  const endpoints = new Map<string, ITsApiEndpoint>();
  for (const [endpointId, endpoint] of apiRegistry.endpoints) {
    endpoints.set(endpointId, {
      apiDocName: endpoint.documentName,
      groupId: endpoint.apiId,
      groupName: endpoint.apiName,
      name: endpoint.name,
      parameters: endpoint.parameters,
      returnValue: endpoint.returnValue,
    });
  }
  return endpoints;
};

/**
 * Compiles every document in a project into one file per document (Contract 4) — the TS-target
 * analogue of `compileGoProject`, but multi-file (`ICompiledProjectFiles`, see `compiled-project-files.ts`)
 * since Contract 4 mirrors the old app's own per-document `code/ts/src/falang/*.ts` layout rather than
 * one translation unit. Reuses `buildStructRegistry`/`buildExternalApiRegistry` (shared with every other
 * target) for struct/API lookups — both already track per-document ownership
 * (`structDocumentId`/`structDocumentName`/`documentStructIds` on `IStructRegistry`,
 * `documentId`/`documentName` on `IExternalApiRegistry`'s own entries), added for `compileRustProject`'s
 * own per-document file layout (see ADR 0019 (private)'s "Rust target" implementation notes) and
 * reused here unchanged rather than re-walking the project a second time.
 */
export const compileTsProject = ({ documents }: ICompileTsProjectParams): ICompiledProjectFiles => {
  const structRegistry = buildStructRegistry(documents);
  const apiRegistry = buildExternalApiRegistry(documents);
  const apiEndpoints = buildTsApiEndpoints(apiRegistry);

  const functionDocuments = documents.filter((document) => document.type === 'function');
  const apiDocuments = documents.filter((document) => document.type === EXTERNAL_API_STRUCTURE_NAME);
  const documentNameById = new Map(documents.map((document) => [document.id, document.name] as const));

  const functionSignatures = new Map<string, ITsFunctionSignature>();
  for (const document of functionDocuments) {
    if (!document.root) continue;
    const signature = getFunctionSignature(document.root);
    functionSignatures.set(document.id, {
      tsName: document.name,
      parameters: signature.parameters,
      returnValue: signature.returnValue,
    });
  }

  const params: ITsCompileParams = {
    structNames: structRegistry.structNames,
    structDefinitions: structRegistry.structDefinitions,
    functionSignatures,
    apiEndpoints,
  };

  const files: Record<string, string> = {};

  for (const [documentId, structIds] of structRegistry.documentStructIds) {
    if (structIds.length === 0) continue;
    const definitions = new Map<string, IStructDefinition>();
    for (const id of structIds) {
      const definition = structRegistry.structDefinitions.get(id);
      if (definition) definitions.set(id, definition);
    }
    const body = emitTsStructDeclarations(definitions, structRegistry.structNames);
    const imports = buildStructImportLines(body, documentId, structRegistry);
    const documentName = documentNameById.get(documentId) ?? documentId;
    files[`${documentName}.ts`] = joinSections(imports.join('\n'), body);
  }

  const groupsByDocument = new Map<string, ITsApiGroup[]>();
  for (const [groupId, api] of apiRegistry.apis) {
    const groups = groupsByDocument.get(api.documentId) ?? [];
    groups.push({ id: groupId, name: api.name });
    groupsByDocument.set(api.documentId, groups);
  }
  for (const document of apiDocuments) {
    const groups = groupsByDocument.get(document.id) ?? [];
    const endpointsForDocument = new Map(
      [...apiEndpoints].filter(([endpointId]) => apiRegistry.endpoints.get(endpointId)?.documentId === document.id),
    );
    const body = emitTsApiDeclarations(document.name, groups, endpointsForDocument, structRegistry.structNames);
    const imports = buildStructImportLines(body, document.id, structRegistry);
    files[`${document.name}.ts`] = joinSections(imports.join('\n'), body);
  }

  files[`${FALANG_GLOBAL_FILE_NAME}.ts`] = buildFalangGlobalFile(apiDocuments);

  const errors: ITsProjectCompileErrorEntry[] = [];
  for (const document of functionDocuments) {
    try {
      if (!document.root) throw new Error(`Function document "${document.id}" has no root node`);
      const body = compileTsFunction(document.root, document.name, params);
      const structImports = buildStructImportLines(body, document.id, structRegistry);
      const functionImports = buildFunctionImportLines(body, document.id, functionSignatures, documentNameById);
      const importLines = [
        `import { FalangGlobal } from './${FALANG_GLOBAL_FILE_NAME}';`,
        ...structImports,
        ...functionImports,
      ];
      files[`${document.name}.ts`] = joinSections(importLines.join('\n'), body);
    } catch (error) {
      errors.push({
        documentId: document.id,
        documentName: document.name,
        ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) throw new TsProjectCompileError(errors, { files });
  return { files };
};
