/**
 * Rewrites a member-access expression so it can be safely embedded in a `typeof` type query:
 * every bracket's contents are normalized to the `number` keyword (tolerating dynamic index
 * expressions such as `x + 1` without needing `x` to be in scope of the type position), and
 * every `.prop` access becomes `['prop']` — TypeScript's typeof-index-access grammar doesn't
 * allow a dot to follow a bracketed index, so bracket notation is used throughout.
 */
const normalizeToTypeQuery = (expression: string): string =>
  expression.replaceAll(/\[[^[\]]*]/g, '[number]').replaceAll(/\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g, "['$1']");

/**
 * Builds a TypeScript type expression that resolves to the precise type of an array-valued
 * expression (as typed into an `arr` field), tolerant of dynamic indices. Returns `unknown`
 * for an empty expression so the hidden prefix stays syntactically valid before the user has
 * typed anything.
 */
export const buildArrayTypeExpression = (arrExpression: string): string => {
  const trimmed = arrExpression.trim();
  if (trimmed === '') return 'unknown';
  return `typeof ${normalizeToTypeQuery(trimmed)}`;
};

/**
 * Builds a TypeScript type expression for the element type of an array-valued expression,
 * e.g. `someobj[x + 1].someArr` -> `typeof someobj[number]['someArr'][number]`.
 */
export const buildArrayElementTypeExpression = (arrExpression: string): string => {
  const arrayType = buildArrayTypeExpression(arrExpression);
  return arrayType === 'unknown' ? 'unknown' : `${arrayType}[number]`;
};

/**
 * Type alias declared ahead of an `arr` field's hidden target assignment, needed because a bare
 * `unknown[]` would reject any array literal/expression element-wise — `Arr<unknown>` accepts one.
 */
export const ARRAY_TYPE_ALIAS_DECL = 'type Arr<T> = T[];\n';

/** Forces an `arr` field's initializer to type-check as *some* array, whatever its element type. */
export const ARRAY_UNKNOWN_TYPE_EXPRESSION = 'Arr<unknown>';
