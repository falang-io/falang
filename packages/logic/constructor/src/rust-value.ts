import type { TVariableInfo } from '@falang/typescript-dto';
import { isRustByRefType } from './rust-type-name.js';

/**
 * Every `string`-typed scope entry in this compiler's model is an owned Rust `String` (see
 * `rust-type-name.ts`), but a compiled string-literal expression is always a borrowed `&str` — Rust
 * string literal syntax has no owned form — so assigning one straight into a `String`-typed binding is
 * a real "mismatched types" error, found only by actually compiling `arrays`' `TestStringArray`
 * (`create-var` with `value: '"hello"'`, typed `stringType`). `.to_string()` fixes this uniformly
 * regardless of what actually produced the value: on a `&str` it converts (the fix this was written
 * for), and on an already-owned `String` (e.g. a plain identifier read) it produces a fresh, independent
 * owned copy — the same "caller keeps its own copy" guarantee `.clone()` gives `array`/`struct` values
 * elsewhere in this target (see `emitCallFunction`'s own doc comment), just spelled differently because
 * `String` doesn't need a `Clone` bound the way an arbitrary struct does. Split out of
 * `rust-leaf-emitters.ts` into its own file (mirroring `sharp-value.ts`'s own split) purely to stay
 * under `oxlint`'s `max-lines`.
 */
export const toOwnedRustValue = (code: string, typeKind: TVariableInfo['type']): string => {
  if (typeKind === 'string') return `(${code}).to_string()`;
  if (typeKind === 'array' || typeKind === 'struct') return `(${code}).clone()`;
  return code;
};

/**
 * Wraps one call-site argument (`call-function`/`call-api`) for the ADR 0019 (private) "Rust target
 * — old-app layout" parameter contract: struct/array parameters are now `&T` references
 * (`rust-type-name.ts`'s `isRustByRefType`), not owned by-value copies, so the caller no longer needs
 * `.clone()` at the call site at all — a plain `&(<expr>)` borrow is enough, and cheaper. `.clone()`'s
 * old job (keeping the caller's own array/struct variable usable after the call) is unaffected either
 * way: borrowing never moves. String/number/boolean scalars are untouched by this contract change and
 * still go through `toOwnedRustValue` (a `String` parameter is still owned by-value, needing the same
 * `&str` -> `String` conversion at the call site it always did).
 */
export const toRustArgValue = (code: string, type: TVariableInfo): string =>
  isRustByRefType(type) ? `&(${code})` : toOwnedRustValue(code, type.type);
