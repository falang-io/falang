import type { ILanguageAdapter } from '../language-adapter.js';
import { UnsupportedConstructError } from '../language-adapter.js';
import { isArrayLikeType, isStringLikeType } from '../type-utils.js';

/** JS/TS spells the same operator differently or not at all in C++ (`===`/`!==` have no loose-vs-strict distinction in C++, so both map to `==`/`!=`); anything not listed here (`??`, `**`, bitwise ops, …) is rejected rather than guessed at. */
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

/** `Math.*` calls with a direct `<cmath>` equivalent. Extend this table, not the walker, to support more calls. */
const CALL_MAP: Readonly<Record<string, (argCodes: readonly string[]) => string>> = {
  'Math.pow': (args) => `std::pow(${args.join(', ')})`,
  'Math.abs': (args) => `std::abs(${args.join(', ')})`,
  'Math.min': (args) => `std::min(${args.join(', ')})`,
  'Math.max': (args) => `std::max(${args.join(', ')})`,
  'Math.sqrt': (args) => `std::sqrt(${args.join(', ')})`,
  'Math.floor': (args) => `std::floor(${args.join(', ')})`,
  'Math.ceil': (args) => `std::ceil(${args.join(', ')})`,
  'Math.round': (args) => `std::round(${args.join(', ')})`,
  // Ported from old `cpp/generateExpression.ts`'s `random` case: `<cstdlib>`'s `std::rand()`
  // (declared via `#include <cstdlib>`, unconditionally added in `compile-cpp-project.ts` — no
  // used-imports scan for cpp, same posture as every other `<c*>` header) divided by `RAND_MAX`,
  // cast to `double` on both sides so the division isn't truncated to an integer — `double`, not
  // `float`, to match every other target's own `Math.random` return type (Go's `float64`, Rust's
  // `f64`, C#'s `double`); cpp/C# both allow implicit narrowing on assignment, so this is safe even
  // into a `float`-typed scope variable, unlike Go/Rust (see `montecarlo-project.fixture.ts`'s own
  // top comment for why every variable that touches this call is `float64`, not `float32`). Old app
  // never called `std::srand`, so this is a deterministic sequence (seed 0) rather than a per-run
  // one — not fixed here since nothing in the MonteCarlo project depends on run-to-run variation,
  // only on the result converging near pi (see ADR 0019 (private)'s MonteCarlo implementation notes).
  'Math.random': () => '((double)std::rand() / (double)RAND_MAX)',
};

const escapeCppStringLiteral = (value: string): string => {
  const escaped = value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\n', String.raw`\n`);
  return `"${escaped}"`;
};

/** First non-`ts`/`js` target, see ADR 0019 (private)'s "Decision" section — `std::vector`/`std::string` assumed for array/string scope types (matching `variableInfoToTsType`'s own array/string rendering), not raw arrays or `char*`. */
export const cppAdapter: ILanguageAdapter = {
  target: 'cpp',

  formatStringLiteral: (value) => escapeCppStringLiteral(value),
  formatNumericLiteral: (text) => text,
  formatBooleanLiteral: (value) => (value ? 'true' : 'false'),

  mapBinaryOperator: (operatorText) => {
    const mapped = BINARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Operator not portable to C++: ${operatorText}`);
    return mapped;
  },

  mapUnaryOperator: (operatorText) => {
    const mapped = UNARY_OPERATOR_MAP[operatorText];
    if (!mapped) throw new UnsupportedConstructError(`Unary operator not portable to C++: ${operatorText}`);
    return mapped;
  },

  emitPropertyAccess: ({ receiverCode, propertyName, receiverType, checker }) => {
    if (
      propertyName === 'length' &&
      (isArrayLikeType(receiverType, checker) || isStringLikeType(receiverType, checker))
    ) {
      return `${receiverCode}.size()`;
    }
    // A plain (non-function) data field on an object type — the only shape a struct's own
    // properties ever take, since `variableInfoToTsType` never renders methods. Anything callable
    // (`.filter`, `.map`, …) never reaches here in the first place: `walk-expression.ts`'s call
    // branch reads a call's callee text directly rather than routing it through `emitPropertyAccess`.
    const property = checker.getPropertyOfType(receiverType, propertyName);
    if (property) {
      const propertyType = checker.getTypeOfSymbol(property);
      if (propertyType.getCallSignatures().length === 0) return `${receiverCode}.${propertyName}`;
    }
    throw new UnsupportedConstructError(`Property not portable to C++: .${propertyName}`);
  },

  emitCall: ({ qualifiedCalleeText, argCodes }) => {
    const emitCallCode = CALL_MAP[qualifiedCalleeText];
    if (!emitCallCode) throw new UnsupportedConstructError(`Call not portable to C++: ${qualifiedCalleeText}(...)`);
    return emitCallCode(argCodes);
  },

  emitElementAccess: ({ receiverCode, indexCode, receiverType, checker }) => {
    if (!isArrayLikeType(receiverType, checker)) {
      throw new UnsupportedConstructError('Element access is only portable to C++ on an array-typed receiver');
    }
    return `${receiverCode}[${indexCode}]`;
  },

  emitConditional: ({ conditionCode, whenTrueCode, whenFalseCode }) =>
    `${conditionCode} ? ${whenTrueCode} : ${whenFalseCode}`,

  // C++ copies by value on plain assignment already (`std::string`/a struct's own copy-assignment
  // operator) — no ownership conversion needed, unlike Rust's `emitAssignment`.
  emitAssignment: ({ leftCode, rightCode }) => `${leftCode} = ${rightCode}`,

  // C++ already performs this widening implicitly ("usual arithmetic conversions") — this is the gap
  // Go/Rust's own `castNumericOperand` exists to close, not cpp's.
  castNumericOperand: (code) => code,

  // An immediately-invoked lambda building a `std::ostringstream` is the closest cpp analogue of
  // `emitLog`'s own `std::cout << ...` chain (`<<` accepts any streamable type, so no per-segment
  // type inspection is needed here either) — but `emitLog` streams straight to stdout as a
  // statement, while this needs a `std::string` *value* usable anywhere an expression is expected
  // (a function argument, a `create-var` initializer, …), hence the lambda instead of a bare
  // `std::cout` chain. `[&]` (not `[]`) since a segment's compiled code may itself reference an
  // enclosing scope variable. Needs `<sstream>` — see `compile-cpp-project.ts`'s `PREAMBLE`.
  emitTemplateLiteral: ({ segments }) => {
    if (segments.length === 0) return 'std::string("")';
    const parts = segments.map((segment) => (segment.isExpr ? segment.text : escapeCppStringLiteral(segment.text)));
    return `([&]{ std::ostringstream _oss; _oss << ${parts.join(' << ')}; return _oss.str(); }())`;
  },
};
