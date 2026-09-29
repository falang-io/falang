import type { TVariableInfo } from '@falang/typescript-dto';
import { UnsupportedConstructError } from './language-adapter.js';

const INTEGER_RUST_TYPES: Readonly<Record<string, string>> = {
  int8: 'i8',
  int16: 'i16',
  int32: 'i32',
  int64: 'i64',
};

/** Identity mapping — Rust's own float type names already are `f32`/`f64`. */
const FLOAT_RUST_TYPES: Readonly<Record<string, string>> = {
  float32: 'f32',
  float64: 'f64',
};

/**
 * Renders a `TVariableInfo` as a Rust type name — the Rust-target analogue of `golang-type-name.ts`'s
 * `variableInfoToGoType`. Same "throw rather than fall back to `any`" posture: Rust has no untyped
 * escape hatch a struct field or `let` declaration could fall back to either.
 *
 * `structDocuments` (thread id -> owning `objects-structure` document's own `name`) is what lets a
 * struct type render as the fully-qualified `crate::falang::<DocName>::<StructName>` path the per-
 * document-file layout needs (ADR 0019 (private)'s "Rust target — old-app layout" implementation
 * notes) — omitted (defaults to empty), a struct still renders as its bare name, which is what the
 * package's own unit tests (compiling one expression/type in isolation, with no document context at
 * all) want. `String`/`Vec` render through the `alloc` crate rather than `std` (`alloc::string::String`/
 * `alloc::vec::Vec<T>`) unconditionally — safe under `std` too, `alloc` is always part of the sysroot —
 * so the same generated code is `#![no_std]`-compatible without a separate flag.
 */
export const variableInfoToRustType = (
  type: TVariableInfo,
  structNames: ReadonlyMap<string, string>,
  structDocuments: ReadonlyMap<string, string> = new Map(),
): string => {
  switch (type.type) {
    case 'string': {
      return 'alloc::string::String';
    }
    case 'boolean': {
      return 'bool';
    }
    case 'void': {
      return '()';
    }
    case 'number': {
      const { numberType } = type;
      if (numberType.type === 'integer') return INTEGER_RUST_TYPES[numberType.integerType];
      if (numberType.type === 'float') return FLOAT_RUST_TYPES[numberType.floatType];
      throw new UnsupportedConstructError(`Number type not portable to Rust: ${numberType.type}`);
    }
    case 'struct': {
      const name = structNames.get(type.id);
      if (!name) throw new UnsupportedConstructError(`Unknown struct id for Rust compilation: ${type.id}`);
      const documentName = structDocuments.get(type.id);
      return documentName ? `crate::falang::${documentName}::${name}` : name;
    }
    case 'array': {
      // Same "wrap N times" shape as `variableInfoToGoType` — `dimensions` wraps the single
      // `elementType` N times (Rust's growable-array type is `Vec<T>`, so N dimensions is
      // `Vec<Vec<...<T>...>>`).
      let rustType = variableInfoToRustType(type.elementType, structNames, structDocuments);
      for (let dimension = 0; dimension < type.dimensions; dimension += 1) rustType = `alloc::vec::Vec<${rustType}>`;
      return rustType;
    }
    default: {
      throw new UnsupportedConstructError(`Type not portable to Rust: ${type.type}`);
    }
  }
};

/** True for the DSL type kinds `compileRustProject`'s per-document-file layout passes by `&` reference (ADR 0019 (private)'s "Rust target — old-app layout" — struct/array; `string`/`number`/`boolean` stay by-value). */
export const isRustByRefType = (type: TVariableInfo): boolean => type.type === 'struct' || type.type === 'array';

/**
 * Renders a function/trait-method parameter's Rust type — `&<T>` for struct/array (the caller keeps its
 * own owned copy, see `rust-leaf-emitters.ts`'s `toOwnedRustValue`/`emitCallFunction`), the plain owned
 * `<T>` otherwise. Shared by `compile-rust-function.ts` (a document's own `fn`) and
 * `emit-rust-api-declarations.ts` (the flattened `Apis` trait's methods) so both stay in sync.
 */
export const variableInfoToRustParamType = (
  type: TVariableInfo,
  structNames: ReadonlyMap<string, string>,
  structDocuments: ReadonlyMap<string, string> = new Map(),
): string => {
  const rendered = variableInfoToRustType(type, structNames, structDocuments);
  return isRustByRefType(type) ? `&${rendered}` : rendered;
};
