import type { ILanguageAdapter } from '../language-adapter.js';
import { UnsupportedConstructError } from '../language-adapter.js';
import { isArrayLikeType, isStringLikeType } from '../type-utils.js';

/** Same C-like operator syntax as C++/Go/Rust for everything this whitelist covers; `===`/`!==` still collapse to `==`/`!=` — C# has no separate strict-equality operator for the primitive/value types these expressions deal with. */
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

/** `Math.*` calls with a direct `System.Math` equivalent — confirmed against old `sharp/generateExpression.ts` (`Math.Pow`, `Math.Sin`). Note `Math.Ceiling`, not `Math.Ceil` — a real C#-specific naming difference from `Math.ceil`/`std::ceil`/`math.Ceil`, not a typo. */
const CALL_MAP: Readonly<Record<string, (argCodes: readonly string[]) => string>> = {
  'Math.pow': (args) => `Math.Pow(${args.join(', ')})`,
  'Math.abs': (args) => `Math.Abs(${args.join(', ')})`,
  'Math.min': (args) => `Math.Min(${args.join(', ')})`,
  'Math.max': (args) => `Math.Max(${args.join(', ')})`,
  'Math.sqrt': (args) => `Math.Sqrt(${args.join(', ')})`,
  'Math.floor': (args) => `Math.Floor(${args.join(', ')})`,
  'Math.ceil': (args) => `Math.Ceiling(${args.join(', ')})`,
  'Math.round': (args) => `Math.Round(${args.join(', ')})`,
  // Ported from old `sharp/generateExpression.ts`'s `random` case, but *not* verbatim: the old code
  // emitted `(new Random()).NextDouble()` at every call site, which is a well-known anti-pattern
  // (each `Random()` construction has real overhead — MonteCarlo's 10M-iteration loop calls this
  // twice per round) rather than a correctness bug (.NET 6+'s parameterless `Random()` constructor
  // seeds from a cryptographically strong source, not the low-resolution system clock the old
  // low-.NET-version behavior this pattern predates would have used, so it wouldn't have produced
  // correlated sequences either way). `_rand` is a single `static readonly Random` field
  // `compile-sharp-project.ts` adds to the `Program` class, conditionally, only when this mapping is
  // actually used — see that file's own comment.
  'Math.random': () => '_rand.NextDouble()',
};

const escapeCSharpStringLiteral = (value: string): string => {
  const escaped = value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\n', String.raw`\n`);
  return `"${escaped}"`;
};

/** Fourth, last non-`ts`/`js` target of this pass — C# has a native ternary, syntactically identical to C++/TS, so `emitConditional` doesn't need Rust's/Go's special-casing. Array scope types are old `sharp/generateExpression.ts`'s own `System.Collections.Generic.List<T>` (not a raw C# array), which is why `.length` maps to `.Count` here rather than C#'s array-only `.Length`. */
export const sharpAdapter: ILanguageAdapter = {
  target: 'sharp',

  formatStringLiteral: (value) => escapeCSharpStringLiteral(value),
  formatNumericLiteral: (text) => text,
  formatBooleanLiteral: (value) => (value ? 'true' : 'false'),

  mapBinaryOperator: (operatorText) => {
    const mapped = BINARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Operator not portable to C#: ${operatorText}`);
    return mapped;
  },

  mapUnaryOperator: (operatorText) => {
    const mapped = UNARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Unary operator not portable to C#: ${operatorText}`);
    return mapped;
  },

  emitPropertyAccess: ({ receiverCode, propertyName, receiverType, checker }) => {
    if (propertyName === 'length' && isStringLikeType(receiverType, checker)) {
      return `${receiverCode}.Length`;
    }
    if (propertyName === 'length' && isArrayLikeType(receiverType, checker)) {
      return `${receiverCode}.Count`;
    }
    const property = checker.getPropertyOfType(receiverType, propertyName);
    if (property) {
      const propertyType = checker.getTypeOfSymbol(property);
      if (propertyType.getCallSignatures().length === 0) return `${receiverCode}.${propertyName}`;
    }
    throw new UnsupportedConstructError(`Property not portable to C#: .${propertyName}`);
  },

  emitCall: ({ qualifiedCalleeText, argCodes }) => {
    const emitCallCode = CALL_MAP[qualifiedCalleeText];
    if (!emitCallCode) throw new UnsupportedConstructError(`Call not portable to C#: ${qualifiedCalleeText}(...)`);
    return emitCallCode(argCodes);
  },

  emitElementAccess: ({ receiverCode, indexCode, receiverType, checker }) => {
    if (!isArrayLikeType(receiverType, checker)) {
      throw new UnsupportedConstructError('Element access is only portable to C# on an array-typed receiver');
    }
    return `${receiverCode}[${indexCode}]`;
  },

  emitConditional: ({ conditionCode, whenTrueCode, whenFalseCode }) =>
    `${conditionCode} ? ${whenTrueCode} : ${whenFalseCode}`,

  // Trivial passthrough — no fixture yet assigns a reference-typed (`List<T>`/struct-class) value via
  // a plain `action` statement (only `call-function`/`create-var`/`return`/`foreach` currently apply
  // `copySharpValue`, see `sharp-value.ts`), so this is left unconverted rather than speculatively
  // wrapping a case nothing exercises yet. Revisit if a real project needs it, same posture as every
  // other "not yet a repeated need" gap this ADR tracks.
  emitAssignment: ({ leftCode, rightCode }) => `${leftCode} = ${rightCode}`,

  // C# already performs this widening implicitly within a binary expression (only narrowing at a
  // declared-type boundary needs an explicit cast — see `sharp-value.ts`'s `toSharpTypedValue`) — this
  // is the gap Go/Rust's own `castNumericOperand` exists to close, not sharp's.
  castNumericOperand: (code) => code,

  // Same `+`-concatenation posture as `emitLog` (see its own doc comment for why a leading `""` guard
  // is needed whenever the first segment is an interpolation — C#'s `+` is numeric addition when both
  // operands are numeric).
  emitTemplateLiteral: ({ segments }) => {
    if (segments.length === 0) return '""';
    const parts = segments.map((segment) => (segment.isExpr ? `(${segment.text})` : escapeCSharpStringLiteral(segment.text)));
    const guard = segments[0]?.isExpr ? ['""'] : [];
    return [...guard, ...parts].join(' + ');
  },
};
