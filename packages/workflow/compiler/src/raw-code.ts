/**
 * Most node fields in the TypeScript node model are already valid TypeScript, typed by the user
 * through a monaco-backed `code-model` field (see `@falang/typescript-scheme`'s `block-elements`).
 * Compiling them is mostly a matter of printing the text as-is; these helpers just normalize
 * incidental whitespace/semicolons so the generated source is consistent regardless of what the
 * user happened to type.
 */

/** Normalizes a raw code snippet into a statement: trimmed, with exactly one trailing `;`. */
export const asStatement = (rawCode: string | undefined | null): string => {
  const trimmed = (rawCode ?? '').trim();
  if (trimmed === '') return '';
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
};

/** Normalizes a raw code snippet into an expression: trimmed, with any trailing `;` stripped. */
export const asExpression = (rawCode: string | undefined | null): string => (rawCode ?? '').trim().replace(/;$/, '');

/**
 * Renders free-form text (e.g. a `function-header`'s description, see `functionCfg` in
 * `@falang/dto`) as a JSDoc comment block, or `''` if blank — unlike `asStatement`/`asExpression`,
 * this text is documentation, not TypeScript to execute.
 */
export const asComment = (rawText: string | undefined | null): string => {
  const trimmed = (rawText ?? '').trim();
  if (trimmed === '') return '';
  return ['/**', ...trimmed.split('\n').map((line) => ` * ${line}`), ' */'].join('\n');
};
