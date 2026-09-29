/** Returns the index just past the quoted string starting at `start` (which must point at the opening quote), respecting `\`-escapes. */
const skipQuotedString = (value: string, start: number): number => {
  const quote = value[start];
  let i = start + 1;
  while (i < value.length && value[i] !== quote) i += value[i] === '\\' ? 2 : 1;
  return i + 1;
};

/**
 * Splits a template-literal body into alternating literal-text and `${...}` expression segments, tracking
 * quoted-string content (with backslash escapes) and brace nesting so a `}` inside a string or object literal
 * doesn't end the interpolation early. Doesn't handle a nested template literal *inside* an interpolation
 * (e.g. `` ${`nested ${x}`} ``) — not needed by any current field kind.
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
 * Escapes a message so it can be embedded verbatim as a template literal body, preserving `${expr}` interpolation
 * — used by `node-emitters.ts`'s `log` node and by `integration-emitters.ts`'s `template-string` fields. Real
 * newline/carriage-return characters are escaped to `\n`/`\r` (rather than left literal) so `indentLines` — which
 * indents by splitting the *whole* generated function body on `\n` — can't inject indentation into the middle of
 * a multi-line pasted text.
 *
 * Only the literal-text segments are escaped; `${...}` expressions are copied through verbatim — otherwise a
 * backslash the user typed as part of real code (e.g. `${arr.join('\n')}`) would get doubled into `\\n`, changing
 * a real newline into the two characters `\` and `n` once the generated source is parsed.
 */
export const escapeTemplateLiteralBody = (value: string): string =>
  splitTemplateSegments(value)
    .map(({ isExpr, text }) =>
      isExpr
        ? text
        : text
            .replaceAll('\\', String.raw`\\`)
            .replaceAll('`', String.raw`\``)
            .replaceAll('\r', String.raw`\r`)
            .replaceAll('\n', String.raw`\n`),
    )
    .join('');
