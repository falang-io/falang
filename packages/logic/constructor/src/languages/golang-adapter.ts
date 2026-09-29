import type { ILanguageAdapter } from '../language-adapter.js';
import { UnsupportedConstructError } from '../language-adapter.js';
import { isArrayLikeType, isStringLikeType } from '../type-utils.js';
import { widthOf } from '../numeric-coercion.js';
import { variableInfoToGoType } from '../golang-type-name.js';

/** `castNumericOperand` never needs struct/array names — it only ever renders a numeric type. */
const NO_STRUCT_NAMES = new Map<string, string>();

/** Same C-like operator syntax as C++ for everything this whitelist covers; `===`/`!==` still collapse to `==`/`!=` — Go, like C++, has no separate strict-equality operator. */
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

const UNARY_OPERATOR_MAP: Readonly<Record<string, string>> = {
  '!': '!',
  '-': '-',
  '+': '+',
};

/** `Math.*` calls with a direct `math` package equivalent — see old `golang/generateExpression.ts`, which only ever exercised `math.Pow`/`math.Sin`; the rest are the same well-known `math` package functions, added by the same pattern. */
const CALL_MAP: Readonly<Record<string, (argCodes: readonly string[]) => string>> = {
  'Math.pow': (args) => `math.Pow(${args.join(', ')})`,
  'Math.abs': (args) => `math.Abs(${args.join(', ')})`,
  'Math.min': (args) => `math.Min(${args.join(', ')})`,
  'Math.max': (args) => `math.Max(${args.join(', ')})`,
  'Math.sqrt': (args) => `math.Sqrt(${args.join(', ')})`,
  'Math.floor': (args) => `math.Floor(${args.join(', ')})`,
  'Math.ceil': (args) => `math.Ceil(${args.join(', ')})`,
  'Math.round': (args) => `math.Round(${args.join(', ')})`,
  // Ported from old `golang/generateExpression.ts`'s `random` case: `math/rand`'s global
  // `Float64()`, added to the import block only when used (`compile-go-project.ts`'s existing
  // substring scan already covers `"math"` and `"math/rand"` separately — a Go identifier never
  // contains a dot, so `rand.` can only be this package's own qualified call). Go 1.20+ auto-seeds
  // the global source from a random value under the hood (no `rand.Seed` call needed, unlike the
  // old pre-1.20 stdlib this was originally ported from).
  'Math.random': () => 'rand.Float64()',
};

const escapeGoStringLiteral = (value: string): string => {
  const escaped = value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\n', String.raw`\n`);
  return `"${escaped}"`;
};

/** Old `golang/util/ucfirstProps.ts` capitalized every path segment after the receiver before emitting a struct field access — Go only exports a struct field whose name starts with an uppercase letter, so a lowercase-named DTO property (`x.z`) has to become `x.Z` to even compile. Ported as-is; exported so `emit-go-struct-declarations.ts`'s statement-level struct field declarations capitalize the same way, keeping the two halves of a struct-field round-trip (declare + access) consistent. */
export const capitalizeFirst = (value: string): string =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);

/** Second non-`ts`/`js` target — Go has no ternary/conditional-expression construct at all (`if` is a statement, not an expression), and no confirmed old-app fallback for it either (searched `old/packages/infrastructure/logic` for `ConditionalNode` handling in any language's codegen — none exists), so `emitConditional` throws explicitly rather than guessing at a workaround. See ADR 0019 (private)'s Implementation notes. */
export const golangAdapter: ILanguageAdapter = {
  target: 'golang',

  formatStringLiteral: (value) => escapeGoStringLiteral(value),
  formatNumericLiteral: (text) => text,
  formatBooleanLiteral: (value) => (value ? 'true' : 'false'),

  mapBinaryOperator: (operatorText) => {
    const mapped = BINARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Operator not portable to Go: ${operatorText}`);
    return mapped;
  },

  mapUnaryOperator: (operatorText) => {
    const mapped = UNARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Unary operator not portable to Go: ${operatorText}`);
    return mapped;
  },

  emitPropertyAccess: ({ receiverCode, propertyName, receiverType, checker }) => {
    // `len(x)` is a Go builtin free function, not a method, for both slices and strings.
    if (
      propertyName === 'length' &&
      (isArrayLikeType(receiverType, checker) || isStringLikeType(receiverType, checker))
    ) {
      return `len(${receiverCode})`;
    }
    const property = checker.getPropertyOfType(receiverType, propertyName);
    if (property) {
      const propertyType = checker.getTypeOfSymbol(property);
      if (propertyType.getCallSignatures().length === 0) return `${receiverCode}.${capitalizeFirst(propertyName)}`;
    }
    throw new UnsupportedConstructError(`Property not portable to Go: .${propertyName}`);
  },

  emitCall: ({ qualifiedCalleeText, argCodes }) => {
    const emitCallCode = CALL_MAP[qualifiedCalleeText];
    if (!emitCallCode) throw new UnsupportedConstructError(`Call not portable to Go: ${qualifiedCalleeText}(...)`);
    return emitCallCode(argCodes);
  },

  emitElementAccess: ({ receiverCode, indexCode, receiverType, checker }) => {
    if (!isArrayLikeType(receiverType, checker)) {
      throw new UnsupportedConstructError('Element access is only portable to Go on an array-typed receiver');
    }
    return `${receiverCode}[${indexCode}]`;
  },

  emitConditional: () => {
    throw new UnsupportedConstructError(
      'Go has no ternary/conditional-expression operator (if is a statement, not an expression) — rewrite the expression without ?:',
    );
  },

  // Go copies by value on plain assignment already (a string/struct value assignment is a full copy)
  // — no ownership conversion needed, unlike Rust's `emitAssignment`.
  emitAssignment: ({ leftCode, rightCode }) => `${leftCode} = ${rightCode}`,

  // The actual fix for the ADR's numeric-coercion follow-up: Go has no implicit conversion between
  // distinct numeric types at all (unlike C++'s "usual arithmetic conversions"), so a binary operator
  // mixing e.g. `int32`+`float32` needs an explicit Go type conversion (`T(x)`) on the narrower
  // operand — `walk-expression.ts`'s binary-expression branch already resolved `to` as the wider of
  // the two via `promoteNumberType`, so this only has to render the conversion syntax.
  castNumericOperand: (code, from, to) =>
    widthOf(from) === widthOf(to) ? code : `${variableInfoToGoType({ type: 'number', numberType: to }, NO_STRUCT_NAMES)}(${code})`,

  // Same `fmt.Sprint`-per-segment posture as `emitLog` (see its own doc comment) — the only
  // difference is `+`-joining the pieces into a `string` *value* here instead of handing them to
  // `fmt.Println` as a statement.
  emitTemplateLiteral: ({ segments }) => {
    if (segments.length === 0) return '""';
    const parts = segments.map((segment) =>
      segment.isExpr ? `fmt.Sprint(${segment.text})` : escapeGoStringLiteral(segment.text),
    );
    return parts.join(' + ');
  },
};
