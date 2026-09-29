import { variableInfoToCppType } from './cpp-type-name.js';
import type { IStructDefinition } from './struct-definition.js';
import { collectStructDependencyIds } from './struct-registry.js';

/**
 * Emits one `struct { ... };` per registry entry, ordered so a struct that nests another struct
 * (e.g. `ObjC.z: ObjA`) is always declared after its dependency — C++ has no forward-declaration
 * escape hatch for a struct held *by value* (unlike a pointer/reference member), so declaration
 * order isn't optional here the way it is for the TS `interface` declarations `compileExpression`
 * emits (TS interfaces may reference each other in any order).
 */
export const emitCppStructDeclarations = (
  structDefinitions: ReadonlyMap<string, IStructDefinition>,
  structNames: ReadonlyMap<string, string>,
): string => {
  const declared: string[] = [];
  const visited = new Set<string>();

  const visit = (id: string, stack: readonly string[]): void => {
    if (visited.has(id)) return;
    if (stack.includes(id)) {
      throw new Error(`Circular struct dependency involving "${structDefinitions.get(id)?.name ?? id}"`);
    }
    const definition = structDefinitions.get(id);
    if (!definition) return;
    for (const propertyType of Object.values(definition.properties)) {
      for (const dependencyId of collectStructDependencyIds(propertyType)) visit(dependencyId, [...stack, id]);
    }
    visited.add(id);
    const fields = Object.entries(definition.properties)
      .map(([name, type]) => `  ${variableInfoToCppType(type, structNames)} ${name};`)
      .join('\n');
    declared.push(`struct ${definition.name} {\n${fields}\n};`);
  };

  for (const id of structDefinitions.keys()) visit(id, []);
  return declared.join('\n\n');
};
