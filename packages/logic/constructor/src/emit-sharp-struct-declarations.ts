import { copySharpValue } from './sharp-value.js';
import { defaultSharpValue, variableInfoToSharpType } from './sharp-type-name.js';
import type { IStructDefinition } from './struct-definition.js';
import { collectStructDependencyIds } from './struct-registry.js';

/**
 * Emits one `public class ... { ... }` per registry entry, each with a generated `Clone()`.
 *
 * **A class, not a C# `struct`** — the same choice the old app's own C# codegen made. A C# `struct`
 * would give value-assignment semantics for free, but only a *shallow* copy: a struct holding a
 * `List<T>` field would still share that list with its copy, so the deep-copy machinery would be
 * needed anyway, and `struct` would additionally forbid the field initializers this emitter relies on
 * (see `defaultSharpValue` — C# forbids instance field initializers on a struct).
 *
 * `Clone()` is what `copySharpValue` calls at every callsite/declaration that needs an independent
 * value (see that function's own doc comment for why C# needs this at all, unlike C++/Go).
 *
 * Declaration *order* doesn't matter to C# (like Go/Rust, unlike C++ — no topological sort needed),
 * but the same dependency walk `emit-cpp-struct-declarations.ts` uses is kept anyway for its cycle
 * check: a struct that (transitively) contains itself by value would make this emitter's own field
 * initializers (`public ObjA z = new ObjA();`) recurse forever at construction time, so it's rejected
 * up front rather than compiling into a program that overflows its stack on the first `new`.
 */
export const emitSharpStructDeclarations = (
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

    const entries = Object.entries(definition.properties);
    const fields = entries
      .map(
        ([name, type]) =>
          `  public ${variableInfoToSharpType(type, structNames)} ${name} = ${defaultSharpValue(type, structNames)};`,
      )
      .join('\n');
    const cloneAssignments = entries
      .map(([name, type]) => `      ${name} = ${copySharpValue(`this.${name}`, type, structNames)},`)
      .join('\n');
    const clone = [
      `  public ${definition.name} Clone() {`,
      `    return new ${definition.name}() {`,
      cloneAssignments,
      '    };',
      '  }',
    ]
      .filter((line) => line !== '')
      .join('\n');
    declared.push(`public class ${definition.name} {\n${fields}\n${clone}\n}`);
  };

  for (const id of structDefinitions.keys()) visit(id, []);
  return declared.join('\n\n');
};
