import { capitalizeFirst } from './languages/golang-adapter.js';
import { variableInfoToGoType } from './golang-type-name.js';
import type { IStructDefinition } from './struct-definition.js';

/**
 * Emits one `type Name struct { ... }` per registry entry — unlike `emitCppStructDeclarations`, no
 * topological ordering is needed: Go resolves every package-level declaration regardless of the
 * order they're written in (a struct may reference another declared later in the same file), so
 * this just walks the registry in its own (insertion/document) order. Field names are capitalized
 * (`golang-adapter.ts`'s `capitalizeFirst`) to stay consistent with `emitPropertyAccess`, which
 * already always capitalizes struct field access — Go only exports a field starting with an
 * uppercase letter, so the declaration and every access of it must agree.
 */
export const emitGoStructDeclarations = (
  structDefinitions: ReadonlyMap<string, IStructDefinition>,
  structNames: ReadonlyMap<string, string>,
): string =>
  [...structDefinitions.values()]
    .map((definition) => {
      const fields = Object.entries(definition.properties)
        .map(([name, type]) => `  ${capitalizeFirst(name)} ${variableInfoToGoType(type, structNames)}`)
        .join('\n');
      return `type ${definition.name} struct {\n${fields}\n}`;
    })
    .join('\n\n');
