import { variableInfoToRustType } from './rust-type-name.js';
import type { IStructDefinition } from './struct-definition.js';

/**
 * Emits one `#[derive(Clone, Default, Debug)] pub struct Name { pub field: T, ... }` per given thread
 * id — the Rust-target analogue of `emitCppStructDeclarations`, but scoped to one `objects-structure`
 * document's own threads at a time (`compile-rust-project.ts` calls this once per document, see
 * ADR 0019 (private)'s "Rust target — old-app layout" implementation notes) rather than the whole
 * project's struct registry in one shot, since each document now compiles to its own file. Both the
 * struct and its fields are `pub`: unlike the old single-file output, a struct declared in one
 * generated file is used (constructed, its fields read/written) from every other generated file and
 * from the hand-written host crate that consumes this module tree, so module-private visibility (the
 * previous single-file design's default) would break every one of those. `structNames`/`structDocuments`
 * are the whole-project registries (not just this document's own), since a field can be typed as a
 * struct declared in a *different* document. All three derives stay load-bearing for the same reasons
 * as before: `Clone` for call-site/assignment ownership copies, `Default` for a value-less `create-var`,
 * `Debug` for `panic!("{:?}", ...)`.
 */
export const emitRustStructDeclarationsForDocument = (
  threadIds: readonly string[],
  structDefinitions: ReadonlyMap<string, IStructDefinition>,
  structNames: ReadonlyMap<string, string>,
  structDocuments: ReadonlyMap<string, string>,
): string =>
  threadIds
    .map((threadId) => {
      const definition = structDefinitions.get(threadId);
      if (!definition) return '';
      const fields = Object.entries(definition.properties)
        .map(([name, type]) => `  pub ${name}: ${variableInfoToRustType(type, structNames, structDocuments)},`)
        .join('\n');
      return `#[derive(Clone, Default, Debug)]\npub struct ${definition.name} {\n${fields}\n}`;
    })
    .filter((block) => block !== '')
    .join('\n\n');
