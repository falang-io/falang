import type { IProjectDocument } from '@falang/dto';
import { buildStructRegistry } from './struct-registry.js';
import { emitSharpStructDeclarations } from './emit-sharp-struct-declarations.js';
import { compileSharpFunction } from './compile-sharp-function.js';
import type { ISharpCompileParams, ISharpFunctionSignature } from './sharp-statement-context.js';
import { NodeCompileError } from './node-compile-error.js';
import { indentLines } from './indent.js';
import { getFunctionSignature } from './function-signature.js';
import { buildExternalApiRegistry } from './external-api-registry.js';
import { emitSharpApiDeclarations } from './emit-sharp-api-declarations.js';

/**
 * `System.Linq` is needed by the element-wise copies `sharp-value.ts` emits (`.Select(...).ToList()`),
 * `System.Collections.Generic` by every array (`List<T>`), `System` by `Console`/`Math`/`Exception`.
 * Unlike Go (where an unused import is a compile error, hence `compile-go-project.ts`'s used-imports
 * scan), C# ignores an unused `using` entirely — so all three are emitted unconditionally.
 */
const PREAMBLE = ['using System;', 'using System.Collections.Generic;', 'using System.Linq;'].join('\n');

export interface ICompileSharpProjectParams {
  /** A project's full document set — `type === 'function'` documents compile to C# static methods, `type === OBJECTS_STRUCTURE_NAME` documents contribute class declarations; anything else is skipped, same posture as the cpp/Go/Rust project compilers. */
  readonly documents: readonly IProjectDocument[];
  /** If given, the compiled output also gets a real `public static void Main()` entry point calling this document's method — the document must have no parameters and a `void` return. */
  readonly entryDocumentId?: string;
}

export interface ISharpProjectCompileErrorEntry {
  readonly documentId: string;
  readonly documentName: string;
  readonly nodeId?: string;
  readonly message: string;
}

/** Same "don't let one broken document hide every other" posture as `CppProjectCompileError`/`GoProjectCompileError`/`RustProjectCompileError`. */
export class SharpProjectCompileError extends Error {
  readonly errors: readonly ISharpProjectCompileErrorEntry[];
  readonly partialCode: string;

  constructor(errors: readonly ISharpProjectCompileErrorEntry[], partialCode: string) {
    super(errors.map((error) => `${error.documentName} (${error.documentId}): ${error.message}`).join('\n'));
    this.name = 'SharpProjectCompileError';
    this.errors = errors;
    this.partialCode = partialCode;
  }
}

/**
 * The class every compiled function becomes a static method of — C# has no free-standing functions,
 * so unlike the cpp/Go/Rust targets this one needs a container type for them.
 */
const PROGRAM_CLASS_NAME = 'Program';

/**
 * C#'s entry point is `Main`, and the comparison here is case-insensitive on purpose: a `function`
 * document named `Main` would collide outright with the synthesized entry point, while one named
 * `main` (the lowercase name every migrated test project actually uses) merely *reads* as a collision
 * — C# is case-sensitive, so `main` and `Main` can legally coexist in one class, and only `Main`
 * counts as an entry-point candidate. Aliasing both keeps the generated source unambiguous to a human
 * reader too, at no cost.
 */
const RESERVED_ENTRY_POINT_NAME = 'main';
const MAIN_NAME_COLLISION_ALIAS = '__falang_main_fn';

const resolveSharpFunctionName = (documentName: string, entryDocumentId?: string): string =>
  Boolean(entryDocumentId) && documentName.toLowerCase() === RESERVED_ENTRY_POINT_NAME
    ? MAIN_NAME_COLLISION_ALIAS
    : documentName;

const buildMain = (
  entryDocumentId: string,
  functionSignatures: ReadonlyMap<string, ISharpFunctionSignature>,
): string => {
  const signature = functionSignatures.get(entryDocumentId);
  if (!signature) throw new Error(`entryDocumentId "${entryDocumentId}" does not match any function document`);
  if (signature.returnValue) {
    throw new Error(`Entry document "${entryDocumentId}" must return void to be used as a C# program's entry point`);
  }
  return `public static void Main() {\n  ${signature.sharpName}();\n}`;
};

/**
 * Compiles every `function` document in a project into one self-contained `.cs` file (usings, then
 * one class per struct, then a single `Program` class holding every compiled function plus an
 * optional `Main`) — the C#-target analogue of `compileCppProject`/`compileGoProject`/
 * `compileRustProject`. Like Go and Rust (and unlike C++), no forward-declaration pass and no
 * struct-declaration topological sort are needed: C# resolves types and members regardless of
 * declaration order.
 */
export const compileSharpProject = ({ documents, entryDocumentId }: ICompileSharpProjectParams): string => {
  const structRegistry = buildStructRegistry(documents);
  const apiRegistry = buildExternalApiRegistry(documents);
  const functionDocuments = documents.filter((document) => document.type === 'function');

  const functionSignatures = new Map<string, ISharpFunctionSignature>();
  for (const document of functionDocuments) {
    if (!document.root) continue;
    const signature = getFunctionSignature(document.root);
    functionSignatures.set(document.id, {
      sharpName: resolveSharpFunctionName(document.name, entryDocumentId),
      parameters: signature.parameters,
      returnValue: signature.returnValue,
    });
  }

  const params: ISharpCompileParams = {
    structNames: structRegistry.structNames,
    structDefinitions: structRegistry.structDefinitions,
    functionSignatures,
    apiEndpoints: apiRegistry.endpoints,
  };

  const errors: ISharpProjectCompileErrorEntry[] = [];
  const functionBlocks: string[] = [];
  for (const document of functionDocuments) {
    try {
      if (!document.root) throw new Error(`Function document "${document.id}" has no root node`);
      const sharpName = functionSignatures.get(document.id)?.sharpName ?? document.name;
      functionBlocks.push(compileSharpFunction(document.root, sharpName, params));
    } catch (error) {
      errors.push({
        documentId: document.id,
        documentName: document.name,
        ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const structDeclarations = emitSharpStructDeclarations(structRegistry.structDefinitions, structRegistry.structNames);
  const apiDeclarations = emitSharpApiDeclarations(apiRegistry, structRegistry.structNames);
  const mainBlock = entryDocumentId ? buildMain(entryDocumentId, functionSignatures) : '';
  const functionsCode = functionBlocks.join('\n\n');
  // `_rand` backs the `Math.random` mapping (`sharp-adapter.ts`) — a single shared field instead of
  // constructing a `new Random()` per call site, added only when actually referenced (same
  // substring-scan posture as `compile-go-project.ts`'s conditional imports, even though an unused
  // C# field wouldn't be a compile error the way an unused Go import is — no reason to emit dead
  // boilerplate into every other project's generated output).
  const randField = functionsCode.includes('_rand.') ? 'private static readonly Random _rand = new Random();' : '';
  const classMembers = [apiDeclarations.fields, randField, functionsCode, mainBlock]
    .filter((section) => section !== '')
    .join('\n\n');
  // `partial` — harmless on its own (a lone partial class with no other part compiles identically to
  // a non-partial one), but needed whenever a `call-api` project's hand-written driver has to extend
  // this same class with its own `Main()` and API-field assignments (see ADR 0019 (private)'s
  // "Implementation notes" for `call-api`) — no `entryDocumentId` is passed for such a project, so
  // `mainBlock` is empty and the driver's own `partial class Program { public static void Main() {...} }`
  // supplies it instead.
  const programClass = `public static partial class ${PROGRAM_CLASS_NAME} {\n${indentLines(classMembers)}\n}`;

  const code = [PREAMBLE, structDeclarations, apiDeclarations.interfaces, programClass]
    .filter((section) => section !== '')
    .join('\n\n');

  if (errors.length > 0) throw new SharpProjectCompileError(errors, code);
  return code;
};
