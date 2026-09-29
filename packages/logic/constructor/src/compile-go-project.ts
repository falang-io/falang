import type { IProjectDocument } from '@falang/dto';
import { buildStructRegistry } from './struct-registry.js';
import { emitGoStructDeclarations } from './emit-go-struct-declarations.js';
import { compileGoFunction } from './compile-go-function.js';
import type { IGoCompileParams, IGoFunctionSignature } from './go-statement-context.js';
import { NodeCompileError } from './node-compile-error.js';
import { getFunctionSignature } from './function-signature.js';
import { buildExternalApiRegistry } from './external-api-registry.js';
import { emitGoApiDeclarations } from './emit-go-api-declarations.js';

export interface ICompileGoProjectParams {
  /** A project's full document set — `type === 'function'` documents compile to Go function definitions, `type === OBJECTS_STRUCTURE_NAME` documents contribute struct declarations; anything else is skipped, same posture as `compileCppProject`. */
  readonly documents: readonly IProjectDocument[];
  /** If given, the compiled output also gets a real `func main() { <fn>() }` entry point calling this document's function — the document must have no parameters and a `void` return. */
  readonly entryDocumentId?: string;
}

export interface IGoProjectCompileErrorEntry {
  readonly documentId: string;
  readonly documentName: string;
  readonly nodeId?: string;
  readonly message: string;
}

/** Same "don't let one broken document hide every other" posture as `CppProjectCompileError`. */
export class GoProjectCompileError extends Error {
  readonly errors: readonly IGoProjectCompileErrorEntry[];
  readonly partialCode: string;

  constructor(errors: readonly IGoProjectCompileErrorEntry[], partialCode: string) {
    super(errors.map((error) => `${error.documentName} (${error.documentId}): ${error.message}`).join('\n'));
    this.name = 'GoProjectCompileError';
    this.errors = errors;
    this.partialCode = partialCode;
  }
}

/** Go, like C++, reserves `main` for the entry point `compileGoProject` synthesizes — same collision-avoidance alias as `compileCppProject`. */
const RESERVED_ENTRY_POINT_NAME = 'main';
const MAIN_NAME_COLLISION_ALIAS = '__falang_main_fn';

const resolveGoFunctionName = (documentName: string, entryDocumentId?: string): string =>
  Boolean(entryDocumentId) && documentName === RESERVED_ENTRY_POINT_NAME ? MAIN_NAME_COLLISION_ALIAS : documentName;

const buildMain = (entryDocumentId: string, functionSignatures: ReadonlyMap<string, IGoFunctionSignature>): string => {
  const signature = functionSignatures.get(entryDocumentId);
  if (!signature) throw new Error(`entryDocumentId "${entryDocumentId}" does not match any function document`);
  if (signature.returnValue) {
    throw new Error(`Entry document "${entryDocumentId}" must return void to be used as a Go program's entry point`);
  }
  return `func main() {\n  ${signature.goName}()\n}`;
};

/**
 * Compiles every `function` document in a project into one self-contained `.go` file (struct
 * declarations, then every function definition, then an optional `main()`) — the Go-target analogue
 * of `compileCppProject`. Two real simplifications over the cpp version, both because of genuine Go
 * language differences (not shortcuts): no forward-declaration prototypes pass (Go resolves
 * package-level calls in any order) and no struct-declaration topological sort (same reason, applies
 * to type declarations too).
 */
export const compileGoProject = ({ documents, entryDocumentId }: ICompileGoProjectParams): string => {
  const structRegistry = buildStructRegistry(documents);
  const apiRegistry = buildExternalApiRegistry(documents);
  const functionDocuments = documents.filter((document) => document.type === 'function');

  const functionSignatures = new Map<string, IGoFunctionSignature>();
  for (const document of functionDocuments) {
    if (!document.root) continue;
    const signature = getFunctionSignature(document.root);
    const goName = resolveGoFunctionName(document.name, entryDocumentId);
    functionSignatures.set(document.id, { goName, returnValue: signature.returnValue });
  }

  const params: IGoCompileParams = {
    structNames: structRegistry.structNames,
    structDefinitions: structRegistry.structDefinitions,
    functionSignatures,
    apiEndpoints: apiRegistry.endpoints,
  };

  const errors: IGoProjectCompileErrorEntry[] = [];
  const functionBlocks: string[] = [];
  for (const document of functionDocuments) {
    try {
      if (!document.root) throw new Error(`Function document "${document.id}" has no root node`);
      const goName = functionSignatures.get(document.id)?.goName ?? document.name;
      functionBlocks.push(compileGoFunction(document.root, goName, params));
    } catch (error) {
      errors.push({
        documentId: document.id,
        documentName: document.name,
        ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const structDeclarations = emitGoStructDeclarations(structRegistry.structDefinitions, structRegistry.structNames);
  const apiDeclarations = emitGoApiDeclarations(apiRegistry, structRegistry.structNames);
  const mainBlock = entryDocumentId ? buildMain(entryDocumentId, functionSignatures) : '';

  const body = [structDeclarations, apiDeclarations, functionBlocks.join('\n\n'), mainBlock]
    .filter((section) => section !== '')
    .join('\n\n');

  // Go rejects an unused import at compile time (unlike C++'s harmless unused #include), so `fmt`/
  // `math` are only added when the compiled body actually needs them — a plain substring scan over
  // the generated text rather than threading a used-imports tracker several layers down into
  // `compileExpression`'s golang adapter. Safe here specifically because a Go identifier can never
  // contain a dot, so "fmt."/"math." can only appear as this package's own qualified-call syntax.
  const imports: string[] = [];
  if (body.includes('fmt.')) imports.push('"fmt"');
  // `rand.` is checked before the plain `math.` scan below so `math/rand`'s calls (which also start
  // with `rand.`, not `math.`) get their own, more specific import — `math.Pow`/etc. never start
  // with `rand.`, so the two scans can't collide.
  if (body.includes('rand.')) imports.push('"math/rand"');
  if (body.includes('math.')) imports.push('"math"');
  const importBlock = imports.length === 0 ? '' : `import (\n${imports.map((imp) => `  ${imp}`).join('\n')}\n)`;

  const code = ['package main', importBlock, body].filter((section) => section !== '').join('\n\n');

  if (errors.length > 0) throw new GoProjectCompileError(errors, code);
  return code;
};
