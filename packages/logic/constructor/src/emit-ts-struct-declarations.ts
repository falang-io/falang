import { variableInfoToTsTypeName } from './ts-type-name.js';
import type { IStructDefinition } from './struct-definition.js';

/**
 * Emits one `export interface Name { field: T; ... }` per definition — the TS-target analogue of
 * `emit-go-struct-declarations.ts`'s `emitGoStructDeclarations`, minus the field-name capitalization
 * that one needs (Go only exports a capitalized field; TS interfaces export every field regardless of
 * case). Like the Go version, no topological ordering: TS interfaces may reference each other in any
 * declaration order. `structDefinitions` here is expected to already be scoped to one document's own
 * struct threads (`compile-ts-project.ts` groups by `documentStructIds` before calling this) — one
 * document's file gets exactly the interfaces its own `objects-structure` threads declare, matching
 * the reference `code/ts` output's own `State.ts` (all 7 structs from that project's single document).
 */
export const emitTsStructDeclarations = (
  structDefinitions: ReadonlyMap<string, IStructDefinition>,
  structNames: ReadonlyMap<string, string>,
): string =>
  [...structDefinitions.values()]
    .map((definition) => {
      const fields = Object.entries(definition.properties)
        .map(([name, type]) => `  ${name}: ${variableInfoToTsTypeName(type, structNames)};`)
        .join('\n');
      return `export interface ${definition.name} {\n${fields}\n}`;
    })
    .join('\n\n');
