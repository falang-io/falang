import type { TVariableInfo } from '@falang/typescript-dto';
import { sharpArrayElementType, variableInfoToSharpType } from './sharp-type-name.js';

/**
 * A deep copy of `code`'s value, for the types where C# would otherwise share a reference.
 *
 * C# is the only target of the four where "the callee/callsite gets its own copy" needs *per-type*
 * handling: C++ copies every parameter/assignment by value implicitly, Go copies structs and slices'
 * headers, Rust moves (and so is forced to `.clone()` uniformly — see `rust-leaf-emitters.ts`'s
 * `toOwnedRustValue`). In C#, a primitive/`string` is already safe (value type / immutable), while a
 * `List<T>` and every generated struct (emitted as a `class`, see `emit-sharp-struct-declarations.ts`)
 * are reference types whose contents a callee could mutate behind the caller's back — breaking exactly
 * the `arrays` project's own load-bearing pattern (`RunFunctions` passes its `x` into five sequential
 * `call-function`s, then still expects its own `[1, 2, 3]`).
 *
 * A `List<T>` of copy-needing elements is copied element-wise (`.Select(...).ToList()`, the same shape
 * the old app's own C# codegen used for an array of structs), so a nested array/struct is deep-copied
 * all the way down rather than sharing its inner lists — unlike old `logic_objects`'s generated
 * `Clone()`, which used a shallow `new List<T>(...)` for an array of arrays.
 */
export const copySharpValue = (
  code: string,
  type: TVariableInfo,
  structNames: ReadonlyMap<string, string>,
  depth = 0,
): string => {
  if (type.type === 'struct') return `(${code}).Clone()`;
  if (type.type !== 'array') return code;
  const elementType = sharpArrayElementType(type);
  if (elementType.type !== 'struct' && elementType.type !== 'array') {
    return `new ${variableInfoToSharpType(type, structNames)}(${code})`;
  }
  const parameter = `_copy${depth}`;
  return `(${code}).Select(${parameter} => ${copySharpValue(parameter, elementType, structNames, depth + 1)}).ToList()`;
};

/**
 * Renders `code` for a context whose target type the DSL states explicitly (a `create-var`'s declared
 * type, a `return`'s function return type, a `call-function` argument's parameter type) — a deep copy
 * for reference types (see `copySharpValue`) plus an explicit cast for numeric ones.
 *
 * The cast exists because C#'s implicit numeric conversions are narrower than C++'s in two ways this
 * migration actually hits: a floating-point literal is `double` (so `float y = 1.5;` is CS0664, no
 * implicit `double`→`float`), and no narrowing conversion is implicit at all — `objects`' own
 * `ObjCSum` returns `int32` from an expression that mixes in a `float32` field, which C++ narrows
 * silently and C# rejects (CS0266). Casting to the DSL's own declared type reproduces the C++ target's
 * behavior exactly, and is what the old app's own C# codegen did for the same reason (its
 * `assign_var`/`convertSymbol` both emitted an explicit `(type)` cast). Contexts where the DSL states
 * no type — a raw `action` assignment, an `arr-push` value — get no cast, so a genuinely
 * unconvertible value fails loudly at `dotnet build` time rather than silently.
 */
export const toSharpTypedValue = (
  code: string,
  type: TVariableInfo,
  structNames: ReadonlyMap<string, string>,
): string => {
  if (type.type === 'number') return `(${variableInfoToSharpType(type, structNames)})(${code})`;
  return copySharpValue(code, type, structNames);
};
