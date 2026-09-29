import { parseExpression } from './expression-parser.js';

/**
 * Translates one old-app (`@falang/editor-scheme`-era, `schemeVersion: 2`) *mathjs*-syntax
 * expression string into TypeScript, per ADR 0019 (private)'s
 * decision that the new logic constructor's expression fields are real TypeScript (type-checked via
 * the TS Compiler API — see `@falang/logic-constructor`'s `compileExpression`), not mathjs. Without
 * this, a converted project carries expressions like `state.snake.dirX == 0 and state.snake.dirY ==
 * 0` straight through — valid mathjs, invalid TypeScript — and every export fails.
 *
 * The old app's own generator
 * (`old/packages/infrastructure/logic/src/logic/code-generation/ts/generateExpression.ts`) parsed
 * every expression with the real `mathjs` package and walked its AST. This module deliberately does
 * **not** do that — two reasons, both found while building this against the real `snake-v2` fixture:
 *
 * 1. **Byte-for-byte fidelity.** `packages/logic/constructor/src/__fixtures__/snake/documents/*.json`
 *    is a hand-fixed, already-in-current-format copy of this package's own `test-fixtures/snake-v2`
 *    (a golden fixture for a concurrent compiler task on the same expression corpus). Diffing it
 *    against the v2 source shows the *only* change made to any expression field across all three
 *    documents that use `and` is a literal `and` → `&&` substring swap — e.g.
 *    `"state.snake.x =nextPoint.x"` (note: no space before `nextPoint`) is carried over **unchanged**,
 *    not reformatted. `mathjs`'s own `Node#toString()` cannot reproduce that: `AssignmentNode` always
 *    reprints as `"lhs = rhs"` with its own canonical spacing, so parsing with `mathjs` and
 *    re-serializing via `.toString()` would pass a test that only checks for `&&`/`||`, but would
 *    silently reformat *every* expression in *every* real converted project — a much larger, harder
 *    to spot diff than the bug this module fixes. `mathjs` also exposes no source-span/position
 *    information on parsed nodes, so there is no way to patch just the tokens that changed on top of
 *    a real `mathjs` parse either.
 * 2. **Weight.** Given (1) already rules out using `mathjs`'s own printer, adding the dependency buys
 *    nothing over a small hand-written parser scoped to exactly this grammar.
 *
 * Instead (`expression-tokenizer.ts`/`expression-parser.ts`): a hand-written tokenizer (string
 * literals are consumed whole and never inspected — `and`/`or`/etc. can never be "found" inside one)
 * plus a recursive-descent parser whose precedence table mirrors mathjs's own (documented at
 * https://mathjs.org/docs/expressions/syntax.html#operators — grouping/indexing/calls tightest,
 * assignment loosest; `not`'s exact tier has no real sample to verify against and is modelled by
 * analogy with unary `-`/`+`, the same "no real sample exists" caveat `old-types.ts`'s module doc
 * already uses for a few old node shapes). Every parsed node keeps a reference to its own source
 * span; reconstruction always recurses back down to those spans and slices the original string for
 * anything that isn't itself being rewritten, so a (sub)expression with nothing to translate anywhere
 * inside it reproduces its input character-for-character. Only `and`/`or`/`not`/`mod`/`xor`/`^`/a
 * whitelisted bare function call ever produce different text; member/index access, other calls,
 * literals, arrays, objects, parens, ternaries and assignment are all emitted verbatim (down to
 * whitespace).
 *
 * Mapping implemented, matching `generateExpression.ts` and
 * `old/packages/infrastructure/logic/src/logic/constants.ts`'s `expressionFunctions` table:
 * - `and` → `&&`, `or` → `||`, `not` → `!`, `mod` → `%` — a plain token swap, the tree shape (and
 *   every other character, including surrounding whitespace) is unchanged.
 * - `a ^ b` → `Math.pow(a, b)`.
 * - `a xor b` → `(!!(a) !== !!(b))` — boolean-coerced strict inequality. This is faithful for any
 *   operand type, not only real booleans, so this mapping never needs the "throw with a clear
 *   message" escape hatch that would otherwise be warranted for a partial translation.
 * - `==`, `!=`, `<`, `>`, `<=`, `>=` and everything else (`+ - * /`, member `.`, index `[]`, arrays,
 *   objects, parens, ternary `?:`, assignment `=`) pass through unchanged.
 * - A bare call to one of the old app's own whitelisted "expression functions"
 *   (`ExpressionFunctionsNames` in `constants.ts` — today exactly `random` and `sin`; the old
 *   generator *throws* `Wrong expression function` on any other name, so a valid old-format project
 *   can never reference one) is rewritten to `Math.<name>(...)`. A call through a member expression
 *   (`obj.sin(x)`) is never rewritten this way — the old generator's own `isFunctionNode` check only
 *   ever recognized a bare `SymbolNode` callee (`node.fn.name`), never an accessor one, so neither
 *   does this module.
 *
 * A syntax error anywhere — including, deliberately, a bare call to a function name outside that
 * whitelist, which a valid old-format project could never contain — aborts *this expression's*
 * translation only: `convertExpression` returns the original text unchanged rather than throwing, so
 * one malformed/unsupported field never aborts converting the rest of the project; a later export
 * attempt reports the problem on the exact node instead.
 *
 * Deliberately out of scope: `:` ranges (matrix slicing — not used by this domain's game/business
 * logic), bitwise xor, postfix factorial `!`/unit conversion `to` — none appear in any real
 * old-format project seen so far; an expression using one fails to parse here and is returned
 * unchanged, same as any other unsupported construct.
 */
export const convertExpression = (oldExpression: string): string => {
  if (!oldExpression.trim()) return oldExpression;
  try {
    return parseExpression(oldExpression).text();
  } catch {
    return oldExpression;
  }
};
