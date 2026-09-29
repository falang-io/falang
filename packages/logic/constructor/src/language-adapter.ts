import type ts from 'typescript';
import type { TExportLanguage } from '@falang/logic-dto';
import type { TNumberTypeDetail, TVariableInfo } from '@falang/typescript-dto';

/** Thrown by an `ILanguageAdapter` (or the walker itself) for a construct with no portable mapping to that adapter's target — caught by `compileExpression` and turned into a `{ ok: false, diagnostics }` result, the same shape a type-check failure produces. Not a bug: an expression using a construct one target doesn't support is normal, expected input. */
export class UnsupportedConstructError extends Error {}

export interface IEmitPropertyAccessParams {
  readonly receiverCode: string;
  readonly propertyName: string;
  readonly receiverType: ts.Type;
  readonly checker: ts.TypeChecker;
}

export interface IEmitCallParams {
  /** The callee's own source text, e.g. `Math.pow` for `Math.pow(a, b)` — matched verbatim against the adapter's known-call table, not resolved through the type checker (these are always well-known global namespaces, not values flowing through scope). */
  readonly qualifiedCalleeText: string;
  readonly argCodes: readonly string[];
}

export interface IEmitElementAccessParams {
  readonly receiverCode: string;
  readonly indexCode: string;
  readonly receiverType: ts.Type;
  readonly checker: ts.TypeChecker;
}

export interface IEmitConditionalParams {
  readonly conditionCode: string;
  readonly whenTrueCode: string;
  readonly whenFalseCode: string;
}

export interface IEmitAssignmentParams {
  readonly leftCode: string;
  readonly leftType: ts.Type;
  readonly rightCode: string;
  readonly checker: ts.TypeChecker;
  /**
   * The DSL-level number type of the left-hand side, when resolvable (see `numeric-coercion.ts`'s
   * `resolveVariableInfo`) — `undefined` when the left-hand side isn't a number or isn't resolvable.
   * Needed only by Rust's own `emitAssignment` (see its own doc comment) to pick the exact float width
   * to cast an integer-*looking* literal right-hand side to; every other adapter ignores it.
   */
  readonly leftNumberType?: TNumberTypeDetail;
  /**
   * Whether the right-hand side is syntactically a bare (optionally parenthesized) integer-*looking*
   * numeric literal — no decimal point or exponent in its exact source spelling (`node.getText`, the
   * same "preserve the literal's exact original spelling" concern `walk-expression.ts`'s own
   * numeric-literal branch already documents). Needed only by Rust: assigning an integer literal
   * directly into a `float32`/`float64`-typed binding (`x.y = 50;`) is a real `rustc` "mismatched
   * types" error — Rust's literal-type inference doesn't retroactively look at the *assignment
   * target*'s type the way Go's untyped constants do, a real gap this ADR's numeric-coercion follow-up
   * found only via the Docker build&run harness, not a unit test (see ADR 0019 (private)). Every
   * other adapter ignores it.
   */
  readonly rightIsIntegerLiteral: boolean;
  /**
   * The right-hand side's own DSL-level `TVariableInfo`, when resolvable via `numeric-coercion.ts`'s
   * `resolveVariableInfo` (`undefined` when it isn't — a numeric literal, a call result, or any other
   * shape that resolver doesn't handle). Needed only by Rust's own `emitAssignment`: since `0019`'s
   * "Rust target — old-app layout" pass moved struct/array function parameters to `&T` references (see
   * that ADR's implementation notes), a plain `a.b = c` assignment of a struct/array-typed value needs
   * an explicit `.clone()` to avoid moving out of a possibly-borrowed `c` — the same ownership concern
   * `toOwnedRustValue` already solves at `create-var`/call-site positions, just needed here too for a
   * bare `action` assignment. Every other adapter ignores it.
   */
  readonly rightVariableInfo?: TVariableInfo;
}

export interface IEmitArrayLiteralParams {
  readonly elementCodes: readonly string[];
}

export interface ITemplateLiteralSegment {
  readonly isExpr: boolean;
  /** Raw literal text (unescaped) when `isExpr` is `false`; the already-compiled target-language expression code when `isExpr` is `true`. */
  readonly text: string;
}

export interface IEmitTemplateLiteralParams {
  readonly segments: readonly ITemplateLiteralSegment[];
}

/**
 * One target language's mapping table for `emitPortableExpression` (`walk-expression.ts`) — the
 * whitelist+per-language-mapping mechanism described in ADR 0019 (private). Implement this once
 * per genuinely different-syntax target (first: `languages/cpp-adapter.ts`); `ts`/`js` don't need one
 * (identity / `ts.transpileModule`, see `compile-expression.ts`).
 */
export interface ILanguageAdapter {
  readonly target: TExportLanguage;
  formatStringLiteral(value: string): string;
  formatNumericLiteral(text: string): string;
  formatBooleanLiteral(value: boolean): string;
  /** @throws {UnsupportedConstructError} if `operatorText` (e.g. `+`, `===`) has no portable mapping. */
  mapBinaryOperator(operatorText: string): string;
  /** @throws {UnsupportedConstructError} if `operatorText` (e.g. `!`, `-`) has no portable mapping. */
  mapUnaryOperator(operatorText: string): string;
  /** @throws {UnsupportedConstructError} if this property isn't in the adapter's whitelist for `receiverType`. */
  emitPropertyAccess(params: IEmitPropertyAccessParams): string;
  /** @throws {UnsupportedConstructError} if `qualifiedCalleeText` isn't in the adapter's call whitelist. */
  emitCall(params: IEmitCallParams): string;
  /** @throws {UnsupportedConstructError} if `receiverType` isn't a whitelisted indexable shape (e.g. not an array). */
  emitElementAccess(params: IEmitElementAccessParams): string;
  /**
   * Emits `condition ? whenTrue : whenFalse` (a TS/JS ternary). Not every target has a native ternary
   * — e.g. Go has no conditional-expression construct at all, so its adapter throws here instead of
   * guessing at a workaround. See ADR 0019 (private)'s Implementation notes for the per-language
   * decision.
   * @throws {UnsupportedConstructError} if the target has no portable ternary/conditional-expression construct.
   */
  emitConditional(params: IEmitConditionalParams): string;
  /**
   * Emits `left = right` (a plain assignment, e.g. a struct-field write like `x.y = "a"`) — split out
   * from the generic `mapBinaryOperator`/`emit` pairing (unlike every other binary operator) because
   * Rust's target needs `leftType` to decide whether `right` needs an ownership conversion first (see
   * `rust-adapter.ts`'s own doc comment); every other target ignores `leftType`/`checker` entirely and
   * emits the trivial `${leftCode} = ${rightCode}`.
   */
  emitAssignment(params: IEmitAssignmentParams): string;
  /**
   * Casts `code` (already known to be a `from`-typed numeric expression) to `to`'s numeric type —
   * called only when a binary operator's two operands resolve to different DSL numeric widths (e.g.
   * `int32 + float32`), which C++/C# convert implicitly but Go/Rust reject outright at compile time
   * (`mismatched types` / `E0308` — see ADR 0019 (private)'s numeric-coercion follow-up).
   * `walk-expression.ts`'s binary-expression branch always passes the *wider* of the two operands'
   * types as `to` (via `numeric-coercion.ts`'s `promoteNumberType`, mirroring C++'s own "usual
   * arithmetic conversions": float always outranks any integer width, wider width wins between two of
   * the same kind), so an adapter never has to make that decision itself — only render the cast syntax
   * (or, for cpp/sharp, return `code` unchanged, since both already do this widening for free).
   */
  castNumericOperand(code: string, from: TNumberTypeDetail, to: TNumberTypeDetail): string;
  /**
   * Emits a TS array literal (`[a, b, c]`) — optional because it was only ever needed by one real
   * fixture (the user's own `example-snake` project's `state.snake.body = [newSnakePoint]`, see
   * ADR 0019 (private)'s "Rust target — old-app layout" implementation notes) and no other target
   * has exercised it yet; `walk-expression.ts` throws `UnsupportedConstructError` for an adapter that
   * doesn't implement it, same as any other unhandled construct.
   * @throws {UnsupportedConstructError} if the target has no portable array-literal mapping.
   */
  emitArrayLiteral?(params: IEmitArrayLiteralParams): string;
  /**
   * Emits a TS template literal (`` `head${expr}tail` ``) as one target-language string-valued
   * expression — the expression-position counterpart of `emitLog`'s own per-target interpolation
   * handling (`cpp-leaf-emitters.ts`/`go-leaf-emitters.ts`/`rust-leaf-emitters.ts`/
   * `sharp-leaf-emitters.ts`), reusing that same posture: let the target's own generic
   * formatting/concatenation builtin stringify whatever type shows up in `${...}` rather than
   * inspecting each interpolated expression's static type. Optional for the same reason
   * `emitArrayLiteral` is — `walk-expression.ts` throws `UnsupportedConstructError` for an adapter
   * that doesn't implement it.
   * @throws {UnsupportedConstructError} if the target has no portable template-literal mapping.
   */
  emitTemplateLiteral?(params: IEmitTemplateLiteralParams): string;
}
