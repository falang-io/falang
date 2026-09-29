/** Returns the index just past the quoted string starting at `start` (which must point at the opening quote), respecting `\`-escapes. */
const skipQuotedString = (value: string, start: number): number => {
  const quote = value[start];
  let i = start + 1;
  while (i < value.length && value[i] !== quote) i += value[i] === '\\' ? 2 : 1;
  return i + 1;
};

/**
 * Splits a template-literal body into alternating literal-text and `${...}` expression segments —
 * mirrors `splitTemplateSegments` in `@falang/workflow-compiler`'s `escape-template-literal.ts`,
 * which does the same for compiled output; see that file for why `${...}` must be tracked instead
 * of escaping the whole value blindly.
 */
const splitTemplateSegments = (value: string): { readonly isExpr: boolean; readonly text: string }[] => {
  const segments: { isExpr: boolean; text: string }[] = [];
  let buffer = '';
  let i = 0;
  while (i < value.length) {
    if (value[i] === '$' && value[i + 1] === '{') {
      if (buffer !== '') segments.push({ isExpr: false, text: buffer });
      buffer = '';
      const exprStart = i;
      i += 2;
      let depth = 1;
      while (i < value.length && depth > 0) {
        const ch = value[i];
        if (ch === "'" || ch === '"') {
          i = skipQuotedString(value, i);
          continue;
        }
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        i += 1;
      }
      segments.push({ isExpr: true, text: value.slice(exprStart, i) });
      continue;
    }
    buffer += value[i];
    i += 1;
  }
  if (buffer !== '') segments.push({ isExpr: false, text: buffer });
  return segments;
};

/**
 * Escapes a plain string value so it can be embedded as a synthetic template-literal body purely
 * for Prism's syntax highlighter in a read-only view — mirrors `escapeTemplateLiteralBody` in
 * `@falang/workflow-compiler`'s `node-emitters.ts`, which does the same for compiled output. Only
 * literal-text segments are escaped; `${...}` expressions are shown verbatim so the preview matches
 * what the compiler actually emits for real code typed inside an interpolation.
 */
export const escapeForTemplateStringDisplay = (value: string | null): string =>
  value
    ? splitTemplateSegments(value)
        .map(({ isExpr, text }) =>
          isExpr ? text : text.replaceAll('\\', String.raw`\\`).replaceAll('`', String.raw`\``),
        )
        .join('')
    : '';
