import type { ILanguageAdapter } from '../language-adapter.js';
import { UnsupportedConstructError } from '../language-adapter.js';
import { isArrayLikeType, isStringLikeType } from '../type-utils.js';
import { widthOf } from '../numeric-coercion.js';
import { variableInfoToRustType } from '../rust-type-name.js';

/** `castNumericOperand` never needs struct/array names — it only ever renders a numeric type. */
const NO_STRUCT_NAMES = new Map<string, string>();

/** Same C-like operator syntax as C++/Go for everything this whitelist covers; `===`/`!==` still collapse to `==`/`!=` — Rust has no separate strict-equality operator either. */
const BINARY_OPERATOR_MAP: Readonly<Record<string, string>> = {
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '%': '%',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
  '==': '==',
  '!=': '!=',
  '===': '==',
  '!==': '!=',
  '&&': '&&',
  '||': '||',
  '=': '=',
};

/** Rust has no unary `+` operator at all (unlike C++/Go/C#) — `+x` is a parse error, not just a no-op, so it's deliberately left out of this map rather than mapped to itself. */
const UNARY_OPERATOR_MAP: Readonly<Record<string, string>> = {
  '!': '!',
  '-': '-',
};

/**
 * `Math.*` calls, emitted as Rust's own inherent `f64` methods rather than free functions — Rust has
 * no `Math` namespace. Old `rust/generateExpression.ts` only ever exercised `pow` (as `.powf(exp)` for
 * a float result, `.pow(exp as u32)` for an integer result — this adapter has no result-type
 * information to pick between them, since `IEmitCallParams` only carries argument code, so it commits
 * to the float form and casts the exponent, `.powf(exp as f64)`; a call whose receiver is actually an
 * integer type is a target-language type error this adapter doesn't catch, the same class of gap the
 * `cpp` adapter already has for numeric coercion) and `sin` (as `.sin()`, unrelated to `Math.sin` which
 * this table doesn't whitelist at all — `sin` isn't in the ADR's or `cpp` adapter's `Math.*` subset
 * either). The rest (`abs`/`min`/`max`/`sqrt`/`floor`/`ceil`/`round`) are the same well-known `f64`
 * inherent methods, added by the same method-call pattern the ported `pow` case establishes.
 * `random` was added later, for the MonteCarlo project — see its own entry below.
 */
const CALL_MAP: Readonly<Record<string, (argCodes: readonly string[]) => string>> = {
  'Math.pow': (args) => `${args[0]}.powf(${args[1]} as f64)`,
  'Math.abs': (args) => `${args[0]}.abs()`,
  'Math.min': (args) => `${args[0]}.min(${args[1]})`,
  'Math.max': (args) => `${args[0]}.max(${args[1]})`,
  'Math.sqrt': (args) => `${args[0]}.sqrt()`,
  'Math.floor': (args) => `${args[0]}.floor()`,
  'Math.ceil': (args) => `${args[0]}.ceil()`,
  'Math.round': (args) => `${args[0]}.round()`,
  // Ported from old `rust/generateExpression.ts`'s `random` case: `std` has no RNG at all, so this
  // is the external `rand` crate's `thread_rng().gen::<f64>()` — a lazily-initialized thread-local
  // generator, cheap to call repeatedly (not re-seeded per call). Needs `use rand::Rng;` (the
  // `Rng` trait, for `.gen`) and a `[dependencies] rand = "0.8"` line in `Cargo.toml` — see
  // `compile-rust-project.ts`'s own conditional-import scan and ADR 0019 (private)'s MonteCarlo
  // implementation notes for the cargo-based Docker harness this needs instead of a bare `rustc`.
  'Math.random': () => 'rand::thread_rng().gen::<f64>()',
};

const escapeRustStringLiteral = (value: string): string => {
  const escaped = value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\n', String.raw`\n`);
  return `"${escaped}"`;
};

/** Third non-`ts`/`js` target. Unlike Go, Rust's `if` **is** an expression (`if cond { a } else { b }` evaluates to a value) — a real, always-valid mapping for a ternary, not a guess, so `emitConditional` uses it rather than throwing. See ADR 0019 (private)'s Implementation notes for why Go and Rust land on opposite answers here. */
export const rustAdapter: ILanguageAdapter = {
  target: 'rust',

  formatStringLiteral: (value) => escapeRustStringLiteral(value),
  formatNumericLiteral: (text) => text,
  formatBooleanLiteral: (value) => (value ? 'true' : 'false'),

  mapBinaryOperator: (operatorText) => {
    const mapped = BINARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Operator not portable to Rust: ${operatorText}`);
    return mapped;
  },

  mapUnaryOperator: (operatorText) => {
    const mapped = UNARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Unary operator not portable to Rust: ${operatorText}`);
    return mapped;
  },

  emitPropertyAccess: ({ receiverCode, propertyName, receiverType, checker }) => {
    if (
      propertyName === 'length' &&
      (isArrayLikeType(receiverType, checker) || isStringLikeType(receiverType, checker))
    ) {
      return `${receiverCode}.len()`;
    }
    const property = checker.getPropertyOfType(receiverType, propertyName);
    if (property) {
      const propertyType = checker.getTypeOfSymbol(property);
      if (propertyType.getCallSignatures().length === 0) return `${receiverCode}.${propertyName}`;
    }
    throw new UnsupportedConstructError(`Property not portable to Rust: .${propertyName}`);
  },

  emitCall: ({ qualifiedCalleeText, argCodes }) => {
    const emitCallCode = CALL_MAP[qualifiedCalleeText];
    if (!emitCallCode) throw new UnsupportedConstructError(`Call not portable to Rust: ${qualifiedCalleeText}(...)`);
    return emitCallCode(argCodes);
  },

  emitElementAccess: ({ receiverCode, indexCode, receiverType, checker }) => {
    if (!isArrayLikeType(receiverType, checker)) {
      throw new UnsupportedConstructError('Element access is only portable to Rust on an array-typed receiver');
    }
    // Confirmed against old `rust/generateExpression.ts`'s own accessor-node case: a Rust index must
    // be `usize`, so the index expression is cast explicitly rather than left as whatever integer type
    // it type-checked as in TS.
    return `${receiverCode}[${indexCode} as usize]`;
  },

  emitConditional: ({ conditionCode, whenTrueCode, whenFalseCode }) =>
    `if ${conditionCode} { ${whenTrueCode} } else { ${whenFalseCode} }`,

  /**
   * A real, previously-latent gap found by actually compiling the `call-api` project's `Test3`/
   * `TestBuildObject2` (`a.a = "123"`, a plain assignment of a string literal into a `String`-typed
   * struct field) — not specific to `call-api` itself, but never exercised before it: `create-var`'s
   * own initializer already gets this treatment (`rust-leaf-emitters.ts`'s `toOwnedRustValue`), but a
   * bare `action` node's raw assignment expression never did, since it's compiled as an ordinary
   * binary expression through this shared adapter, not through a statement-level emitter that could
   * apply the fix positionally. Wrapping the RHS in `.to_string()` whenever the *left*-hand side's own
   * resolved type is `string` is safe unconditionally — same reasoning `toOwnedRustValue`'s own doc
   * comment already gives: `.to_string()` on an already-owned `String` just produces a fresh
   * independent copy, so this doesn't need to know whether the RHS is a literal or an existing
   * variable. Array/struct-typed left-hand sides are a separate, still-open gap (no fixture yet
   * assigns one of those via a bare `action` rather than `create-var`/`arr-*`/`call-function`) —
   * deliberately not fixed speculatively, same "extend on a real, demonstrated need" posture as every
   * other gap this ADR tracks.
   */
  emitAssignment: ({
    leftCode,
    leftType,
    rightCode,
    checker,
    leftNumberType,
    rightIsIntegerLiteral,
    rightVariableInfo,
  }) => {
    if (isStringLikeType(leftType, checker)) return `${leftCode} = (${rightCode}).to_string()`;
    // A second, independent gap in the same family, found only by actually compiling `objects` on
    // Rust once its own fixture stopped retyping `ObjC.y` away from `float32` (see
    // ADR 0019 (private)'s numeric-coercion follow-up): `x.y = 50;` — an integer-*looking* literal
    // assigned straight into a `float32` field — is a real `rustc` "mismatched types" error. Rust's
    // literal-type inference doesn't retroactively widen to the assignment target's type the way Go's
    // untyped constants do, so the literal needs an explicit `as` cast to the left-hand side's own
    // declared float width.
    if (rightIsIntegerLiteral && leftNumberType?.type === 'float') {
      return `${leftCode} = (${rightCode}) as ${variableInfoToRustType({ type: 'number', numberType: leftNumberType }, NO_STRUCT_NAMES)}`;
    }
    // A third gap in the same family, found only by actually compiling the user's own `example-snake`
    // project (ADR 0019 (private)'s "Rust target — old-app layout" implementation notes): a plain
    // `action` assignment of a struct/array-typed value (e.g. `state.food = foodPoint;`) needs the same
    // `.clone()` `create-var`'s own initializer and a call-site argument already get — since
    // `0019`'s "Rust target — old-app layout" pass made struct/array function *parameters* `&T`
    // references, the right-hand side here can easily be a borrowed value (or a local that's read
    // again later), and assigning it in without cloning would either fail to borrow-check or silently
    // move a variable still needed afterward.
    if (rightVariableInfo && (rightVariableInfo.type === 'struct' || rightVariableInfo.type === 'array')) {
      return `${leftCode} = (${rightCode}).clone()`;
    }
    return `${leftCode} = ${rightCode}`;
  },

  // Ported for the user's own `example-snake` project (`state.snake.body = [newSnakePoint]` — a plain
  // TS array literal assigned into an array-typed field, see ADR 0019 (private)'s "Rust target —
  // old-app layout" implementation notes): `alloc::vec![...]` is the `no_std`-compatible spelling of
  // `vec![...]` (see `rust-type-name.ts`'s own doc comment on why every `Vec`/`String` in this target
  // goes through `alloc` rather than `std`). Every element is wrapped in `.clone()` unconditionally — a
  // real bug the *host crate's own real `cargo build`* found (unit tests/the Docker e2e harness never
  // exercise an element that's reused afterward): `state.snake.body = [newSnakePoint]` followed later by
  // `drawSnakeSquare(&newSnakePoint, ...)` is a real "borrow of moved value" `rustc` error otherwise,
  // since `newSnakePoint` would move into the `Vec` — `walk-expression.ts`'s array-literal branch has no
  // per-element DSL type information to decide *whether* an element needs cloning the way
  // `rust-leaf-emitters.ts`'s `toOwnedRustValue` can (it only ever sees already-compiled code strings),
  // so this clones unconditionally instead: always correct (every type this compiler ever produces a
  // value of implements `Clone`, see `emit-rust-struct-declarations.ts`), only occasionally superfluous
  // for a `Copy` scalar or a fresh literal never reused — the same "clone rather than risk a move" bias
  // this target already takes everywhere else.
  emitArrayLiteral: ({ elementCodes }) => `alloc::vec![${elementCodes.map((code) => `(${code}).clone()`).join(', ')}]`,

  // The actual fix for the ADR's numeric-coercion follow-up: Rust, like Go, has no implicit conversion
  // between distinct numeric types at all, so a binary operator mixing e.g. `i32`+`f32` needs an
  // explicit `as` cast on the narrower operand — `walk-expression.ts`'s binary-expression branch
  // already resolved `to` as the wider of the two via `promoteNumberType`, so this only has to render
  // the cast syntax. `code` is wrapped in its own parens first: Rust's `as` binds *tighter* than every
  // arithmetic operator (confirmed against the reference's operator-precedence table), so an
  // unparenthesized `a + b as f32` would parse as `a + (b as f32)` instead of `(a + b) as f32` for a
  // compound `code` (e.g. the accumulated result of a longer `+` chain one level up).
  castNumericOperand: (code, from, to) =>
    widthOf(from) === widthOf(to)
      ? code
      : `(${code}) as ${variableInfoToRustType({ type: 'number', numberType: to }, NO_STRUCT_NAMES)}`,

  // Same `format!`-with-`{}`-placeholders posture as `emitLog` (see its own doc comment for the
  // brace-doubling/escaping rationale) — always wrapped in `format!(...)` (never a bare literal, even
  // with zero interpolations) so this always evaluates to an owned `String`, not a `&str`, matching
  // every other segment-having branch's result type.
  emitTemplateLiteral: ({ segments }) => {
    let format = '';
    const args: string[] = [];
    for (const segment of segments) {
      if (segment.isExpr) {
        format += '{}';
        args.push(segment.text);
      } else {
        format += segment.text.replaceAll('{', '{{').replaceAll('}', '}}');
      }
    }
    const formatLiteral = escapeRustStringLiteral(format);
    return args.length === 0 ? `format!(${formatLiteral})` : `format!(${formatLiteral}, ${args.join(', ')})`;
  },
};
