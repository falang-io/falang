/**
 * The operator/function tables `expression-parser.ts` drives its grammar from — split into its own
 * file purely to keep that file under `oxlint`'s `max-lines`, same reasoning
 * `expression-tokenizer.ts`'s own module doc gives. See `convert-expression.ts`'s module doc for the
 * mapping these encode and why.
 */

/** The old app's `ExpressionFunctionsNames` (`old/.../logic/src/logic/constants.ts`) — the *only* bare function names a valid old-format project can contain, since the old generator throws on any other name. */
export const OLD_EXPRESSION_FUNCTIONS = new Set(['random', 'sin']);

/** Every table below maps a token's own text to its replacement (`null` keeps the token unchanged) for `ExpressionParser#binaryChain`/its own unary-prefix handling — everything at this precedence tier that doesn't need translating passes through untouched, including punctuation this grammar otherwise never assigns semantic meaning to (`&`/`|`). */
export const UNARY_OPS: Record<string, string | null> = { '-': null, '+': null, '!': null, '~': null, not: '!' };
export const MULT_OPS: Record<string, string | null> = { '*': null, '/': null, '%': null, mod: '%' };
export const ADD_OPS: Record<string, string | null> = { '+': null, '-': null };
export const REL_OPS: Record<string, string | null> = {
  '==': null,
  '!=': null,
  '<': null,
  '>': null,
  '<=': null,
  '>=': null,
};
export const BITAND_OPS: Record<string, string | null> = { '&': null };
export const BITOR_OPS: Record<string, string | null> = { '|': null };
export const AND_OPS: Record<string, string | null> = { and: '&&' };
export const OR_OPS: Record<string, string | null> = { or: '||' };
