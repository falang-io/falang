import type { IProjectDocument } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { buildStructRegistry } from './struct-registry.js';
import { emitRustStructDeclarationsForDocument } from './emit-rust-struct-declarations.js';
import { compileRustFunction } from './compile-rust-function.js';
import type { IRustCompileParams, IRustFunctionSignature } from './rust-statement-context.js';
import { NodeCompileError } from './node-compile-error.js';
import { getFunctionSignature } from './function-signature.js';
import { buildExternalApiRegistry } from './external-api-registry.js';
import { emitRustApisTrait } from './emit-rust-api-declarations.js';
import type { ICompiledProjectFiles } from './compiled-project-files.js';

export interface ICompileRustProjectParams {
  /** A project's full document set — `type === 'function'` documents compile to one Rust module file each, `type === OBJECTS_STRUCTURE_NAME` documents to one struct-declarations file each; anything else is skipped, same posture as `compileGoProject`. */
  readonly documents: readonly IProjectDocument[];
  /**
   * If given, `mod.rs` re-exports this document's own compiled function as `falang_entry` (`pub use
   * self::<DocName>::<fnName> as falang_entry;`) — a stable name the e2e Docker harness's own hand-written
   * driver calls regardless of what the DSL project happens to name its entry document. The document
   * must have no parameters (besides the implicit `_apis` every function gets) and a `void` return.
   * Unlike the previous single-file design, this is *not* a real Rust binary `fn main()` — a bare
   * `fn main()` can't construct a `&mut dyn Apis` on its own (nothing implements that trait inside the
   * generated code, by design — see `emitRustApisTrait`'s own doc comment), so a real host crate
   * (either a hand-written one, like the user's own `example-snake` project, or the e2e harness's own
   * driver) always supplies its own `fn main()` and constructs the `Apis` implementation itself. Most
   * callers (including every real project) simply omit this and call `falang::<DocName>::<fnName>(...,
   * &mut apis)` directly — see ADR 0019 (private)'s "Rust target — old-app layout" implementation
   * notes.
   */
  readonly entryDocumentId?: string;
}

export interface IRustProjectCompileErrorEntry {
  readonly documentId: string;
  readonly documentName: string;
  readonly nodeId?: string;
  readonly message: string;
}

/** Same "don't let one broken document hide every other" posture as `CppProjectCompileError`/`GoProjectCompileError`. */
export class RustProjectCompileError extends Error {
  readonly errors: readonly IRustProjectCompileErrorEntry[];
  /** Every file that *did* compile, keyed the same way `compileRustProject`'s own success return is (`ICompiledProjectFiles['files']`) — a broken document's own file is simply missing from this map, not a placeholder. */
  readonly partialFiles: Readonly<Record<string, string>>;

  constructor(errors: readonly IRustProjectCompileErrorEntry[], partialFiles: Readonly<Record<string, string>>) {
    super(errors.map((error) => `${error.documentName} (${error.documentId}): ${error.message}`).join('\n'));
    this.name = 'RustProjectCompileError';
    this.errors = errors;
    this.partialFiles = partialFiles;
  }
}

/**
 * Suppresses warnings this compiler's output routinely triggers but that are never actual bugs: DSL
 * function/document names are typically PascalCase (`non_snake_case`), every scalar parameter is
 * declared `mut` regardless of whether the body actually reassigns it (`unused_mut`, see
 * `compile-rust-function.ts`'s own doc comment on `buildRustSignatureLine`), a loop's synthesized index
 * name may go unused (`unused_variables`), a document compiled but never called from any reachable path
 * is still valid output (`dead_code`), and a handful of emitted statements (`Vec::pop`'s `Option`,
 * `Vec::splice`'s draining iterator) are deliberately used only for their side effect
 * (`unused_must_use`). `unreachable_code` covers the new auto-declared/auto-returned `returnValue`
 * local every non-void function gets unconditionally (`compile-rust-function.ts`'s own
 * `RETURN_VALUE_NAME` mechanism, ported from the old app's own convention/Contract 4's TS-target twin):
 * its trailing `return returnValue;` is dead code whenever the DSL body already ends in an explicit
 * `return` elsewhere, same as the TS target's identical trailing `return returnValue;` coexisting with
 * an earlier explicit `return` (see that function's own doc comment). Mirrors the old app's own
 * `#[allow(non_snake_case)]`/`#[allow(unused_mut)]` file-level attributes on generated Rust. Must be the
 * very first thing in `mod.rs` — Rust requires inner attributes (`#![...]`) to precede every other item
 * — and, being an inner attribute on the `falang` module's own file, it applies to every descendant
 * module `mod.rs` declares regardless of which physical file that submodule's own source lives in
 * (Rust's lint scoping follows the *logical* module tree, not file boundaries), so no other generated
 * file needs its own copy.
 */
const FILE_ATTRIBUTES =
  '#![allow(non_snake_case, unused_mut, unused_variables, dead_code, unused_must_use, unreachable_code)]';

/**
 * Prepends `extern crate alloc;` to a generated file's own content when (and only when) it actually uses
 * an `alloc::`-qualified type (`alloc::string::String`/`alloc::vec::Vec`/`alloc::vec![...]`, see
 * `rust-type-name.ts`) — same conditional-import posture as `compile-go-project.ts`'s own `rand::` scan.
 * `alloc` is always part of the Rust sysroot (available under `std` too, not just `#![no_std]`), so this
 * needs no target-detection: the same generated file is valid whether the host crate is `std` or
 * `#![no_std]`.
 */
const withAllocHeader = (code: string): string => (code.includes('alloc::') ? `extern crate alloc;\n\n${code}` : code);

/**
 * Prepends `use rand::Rng;` to a generated file's own content when (and only when) it actually calls
 * `rand::thread_rng().gen::<T>()` (the `Math.random` mapping, added for the MonteCarlo project — see
 * `languages/rust-adapter.ts`) — needed for `.gen` to resolve at all, unlike every other call this
 * compiler emits (prelude macros or inherent/trait methods already in scope). A real regression the
 * Docker build&run harness found: the single-file design's own `compile-rust-project.ts` used to do this
 * once for the whole combined `body` string; the per-document-file split needs the same scan applied
 * per file instead, since only the file that actually calls `Math.random` needs the import. A Rust
 * identifier can't contain `::`, so `rand::` can only appear as this exact qualified call — same
 * substring-scan posture as `withAllocHeader` above and `compile-go-project.ts`'s own conditional
 * `rand`/`math` imports.
 */
const withRandHeader = (code: string): string => (code.includes('rand::') ? `use rand::Rng;\n\n${code}` : code);

const withFileHeaders = (code: string): string => withRandHeader(withAllocHeader(code));

const buildFunctionSignatures = (
  functionDocuments: readonly IProjectDocument[],
): Map<string, IRustFunctionSignature> => {
  const functionSignatures = new Map<string, IRustFunctionSignature>();
  for (const document of functionDocuments) {
    if (!document.root) continue;
    const signature = getFunctionSignature(document.root);
    functionSignatures.set(document.id, {
      rustName: document.name,
      documentName: document.name,
      parameters: signature.parameters,
      returnValue: signature.returnValue,
    });
  }
  return functionSignatures;
};

const buildEntryReExport = (
  entryDocumentId: string,
  functionSignatures: ReadonlyMap<string, IRustFunctionSignature>,
): string => {
  const signature = functionSignatures.get(entryDocumentId);
  if (!signature) throw new Error(`entryDocumentId "${entryDocumentId}" does not match any function document`);
  if (signature.returnValue) {
    throw new Error(`Entry document "${entryDocumentId}" must return void to be used as a Rust program's entry point`);
  }
  // `self::`, not a bare `<documentName>::<rustName>` — a real bug the Docker build&run harness found:
  // Rust 2018+ resolves a bare leading path segment in a `use`/`pub use` statement against the extern
  // prelude (crate names), not the current module's own lexical scope, unlike an ordinary expression
  // path (`emitCallFunction`'s own `crate::falang::<Doc>::<fn>(...)` calls are unaffected — that's a
  // fully-qualified `crate::`-rooted path, never ambiguous). `self::` disambiguates to "the sibling
  // module declared right here in this same mod.rs".
  return `pub use self::${signature.documentName}::${signature.rustName} as falang_entry;`;
};

/**
 * Compiles every `function`/`objects-structure` document in a project into its own Rust module file,
 * plus `mod.rs` (the module tree) and `falang_global.rs` (the flattened `Apis` trait every function
 * takes as its last parameter) — the old app's own generated-code layout (ADR 0019 (private)'s "Rust
 * target — old-app layout" implementation notes), replacing the previous single-file/`OnceLock`-statics
 * design so the output can compile inside a real `#![no_std]` embedded host crate (the user's own
 * `example-snake` project). Same two simplifications over the cpp version as Go/the previous Rust design
 * already had, for the same real language reasons: no forward-declaration prototypes pass and no
 * struct-declaration topological sort — Rust, like Go, resolves module-level items in any order,
 * regardless of which file they physically live in.
 */
export const compileRustProject = ({
  documents,
  entryDocumentId,
}: ICompileRustProjectParams): ICompiledProjectFiles => {
  const structRegistry = buildStructRegistry(documents);
  const apiRegistry = buildExternalApiRegistry(documents);
  const functionDocuments = documents.filter((document) => document.type === 'function');
  const objectsDocuments = documents.filter((document) => document.type === OBJECTS_STRUCTURE_NAME);
  const functionSignatures = buildFunctionSignatures(functionDocuments);

  const params: IRustCompileParams = {
    structNames: structRegistry.structNames,
    structDefinitions: structRegistry.structDefinitions,
    structDocuments: structRegistry.structDocumentName,
    functionSignatures,
    apiEndpoints: apiRegistry.endpoints,
  };

  const errors: IRustProjectCompileErrorEntry[] = [];
  const files: Record<string, string> = {};

  for (const document of objectsDocuments) {
    try {
      const threadIds = structRegistry.documentStructIds.get(document.id) ?? [];
      const body = emitRustStructDeclarationsForDocument(
        threadIds,
        structRegistry.structDefinitions,
        structRegistry.structNames,
        structRegistry.structDocumentName,
      );
      files[`${document.name}.rs`] = withFileHeaders(body);
    } catch (error) {
      errors.push({
        documentId: document.id,
        documentName: document.name,
        ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const document of functionDocuments) {
    try {
      if (!document.root) throw new Error(`Function document "${document.id}" has no root node`);
      const code = compileRustFunction(document.root, document.name, params);
      files[`${document.name}.rs`] = withFileHeaders(code);
    } catch (error) {
      errors.push({
        documentId: document.id,
        documentName: document.name,
        ...(error instanceof NodeCompileError ? { nodeId: error.nodeId } : {}),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const apisTrait = emitRustApisTrait(apiRegistry, structRegistry.structNames, structRegistry.structDocumentName);
  files['falang_global.rs'] = withFileHeaders(apisTrait);

  const modDeclarations = [...objectsDocuments, ...functionDocuments].map((document) => `pub mod ${document.name};`);
  const modSections = [FILE_ATTRIBUTES, ['pub mod falang_global;', ...modDeclarations].join('\n')];
  if (entryDocumentId) modSections.push(buildEntryReExport(entryDocumentId, functionSignatures));
  files['mod.rs'] = modSections.join('\n\n');

  if (errors.length > 0) throw new RustProjectCompileError(errors, files);
  return { files };
};
