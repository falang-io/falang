// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
/**
 * A template-string field (`log`'s message, a vendor's `template-string` field) stores the *body* of a template
 * literal as the user sees it: literal text plus `${expr}` interpolations, real newlines, no escaping. The projection
 * prints it as a real template literal and parses it back. Mirrors `@falang/workflow-compiler`'s
 * `escapeTemplateLiteralBody` (same segment split), plus the inverse.
 */

interface ISegment {
  readonly isExpr: boolean;
  readonly text: string;
}

const skipQuoted = (value: string, start: number): number => {
  const quote = value[start];
  let i = start + 1;
  while (i < value.length && value[i] !== quote) i += value[i] === '\\' ? 2 : 1;
  return i + 1;
};

/** Splits into literal text and `${…}` segments (brace/quote aware; the `${`/`}` stay in the expression segment). */
export const splitTemplateSegments = (value: string, escapesInLiteralText = false): ISegment[] => {
  const segments: ISegment[] = [];
  let buffer = '';
  let i = 0;
  while (i < value.length) {
    // In literal *source* text a backslash escapes the next character (`\${` is not an interpolation); in a stored
    // field body it is just a character, exactly as the compiler's own split treats it.
    if (escapesInLiteralText && value[i] === '\\' && i + 1 < value.length) {
      buffer += value.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (value[i] === '$' && value[i + 1] === '{') {
      if (buffer !== '') segments.push({ isExpr: false, text: buffer });
      buffer = '';
      const start = i;
      i += 2;
      let depth = 1;
      while (i < value.length && depth > 0) {
        const ch = value[i];
        if (ch === "'" || ch === '"' || ch === '`') {
          i = skipQuoted(value, i);
          continue;
        }
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        i += 1;
      }
      segments.push({ isExpr: true, text: value.slice(start, i) });
      continue;
    }
    buffer += value[i];
    i += 1;
  }
  if (buffer !== '') segments.push({ isExpr: false, text: buffer });
  return segments;
};

/** Field body → template literal source (with backticks). Newlines stay real newlines — the file is meant to be read. */
export const templateLiteralSource = (body: string): string => {
  const escaped = splitTemplateSegments(body)
    .map(({ isExpr, text }) => (isExpr ? text : text.replaceAll('\\', String.raw`\\`).replaceAll('`', String.raw`\``)))
    .join('');
  return `\`${escaped}\``;
};

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  0: '\0',
};

/** Cooks the escapes of a template/string literal's literal text (the inverse of `templateLiteralSource`'s escaping). */
export const cookLiteralText = (raw: string): string => {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      i += 1;
      continue;
    }
    const next = raw[i + 1] ?? '';
    if (next === '\r' || next === '\n') {
      i += next === '\r' && raw[i + 2] === '\n' ? 3 : 2;
      continue;
    }
    if (next in SIMPLE_ESCAPES) {
      out += SIMPLE_ESCAPES[next];
      i += 2;
      continue;
    }
    if (next === 'x') {
      out += String.fromCodePoint(Number.parseInt(raw.slice(i + 2, i + 4), 16));
      i += 4;
      continue;
    }
    if (next === 'u') {
      if (raw[i + 2] === '{') {
        const end = raw.indexOf('}', i);
        out += String.fromCodePoint(Number.parseInt(raw.slice(i + 3, end), 16));
        i = end + 1;
      } else {
        out += String.fromCodePoint(Number.parseInt(raw.slice(i + 2, i + 6), 16));
        i += 6;
      }
      continue;
    }
    out += next;
    i += 2;
  }
  return out;
};

/**
 * Template literal source text between the backticks → field body: literal segments cooked, `${…}` segments verbatim.
 * A `$` followed by `{` that was escaped (`\${`) can't be represented in a field body (where `${` always interpolates)
 * and is returned as-is.
 */
export const templateBodyFromSource = (rawBetweenBackticks: string): string =>
  splitTemplateSegments(rawBetweenBackticks, true)
    .map(({ isExpr, text }) => (isExpr ? text : cookLiteralText(text)))
    .join('');
