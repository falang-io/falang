/**
 * Conversions between a stored TypeScript *expression* and the text a user edits in a text field
 * (`TemplateStringStore`: plain text with `${expr}` interpolations). Used where a field's data must
 * stay a real TS expression (compilers consume it verbatim) but a string-typed value is nicer to edit
 * as text — e.g. `arr-push`/`arr-unshift` into an array of strings.
 */

const isInterpolationStart = (value: string, index: number): boolean =>
  value[index] === '$' && value[index + 1] === '{';

/** Index just past the `${…}` interpolation starting at `start`, tracking quotes and brace depth. */
const skipInterpolation = (value: string, start: number): number => {
  let i = start + 2;
  let depth = 1;
  while (i < value.length && depth > 0) {
    const ch = value[i];
    if (ch === "'" || ch === '"') {
      i += 1;
      while (i < value.length && value[i] !== ch) i += value[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return i;
};

const SIMPLE_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0' };

/** The value of a single- or double-quoted literal spanning the whole `expr`, or `null`. */
const parseQuotedLiteral = (expr: string): string | null => {
  const quote = expr[0];
  if ((quote !== "'" && quote !== '"') || expr.length < 2) return null;
  let result = '';
  let i = 1;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === quote) return i === expr.length - 1 ? result : null;
    if (ch === '\\') {
      const next = expr[i + 1] ?? '';
      result += SIMPLE_ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '\n') return null;
    result += ch;
    i += 1;
  }
  return null;
};

/** The body of a template literal spanning the whole `expr` (interpolations kept verbatim), or `null`. */
const parseTemplateLiteral = (expr: string): string | null => {
  if (expr[0] !== '`' || expr.length < 2) return null;
  let result = '';
  let i = 1;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '`') return i === expr.length - 1 ? result : null;
    if (ch === '\\') {
      const next = expr[i + 1] ?? '';
      result += next === '`' || next === '\\' || next === '$' ? next : `\\${next}`;
      i += 2;
      continue;
    }
    if (isInterpolationStart(expr, i)) {
      const end = skipInterpolation(expr, i);
      result += expr.slice(i, end);
      i = end;
      continue;
    }
    result += ch;
    i += 1;
  }
  return null;
};

/** The text of a value that is a whole string or template literal (as `expressionToTextValue` reads it), else `null`. */
export const stringLiteralText = (expression: string): string | null => {
  const expr = expression.trim();
  const quoted = parseQuotedLiteral(expr);
  if (quoted !== null && !quoted.includes('${')) return quoted;
  return parseTemplateLiteral(expr);
};

/**
 * The text a user edits for a stored expression: a quoted or template literal becomes its text,
 * an empty value stays empty, and any other expression is shown as one interpolation (`${expr}`),
 * which evaluates to the same string.
 */
export const expressionToTextValue = (expression: string): string => {
  const expr = expression.trim();
  if (expr === '') return '';
  return stringLiteralText(expr) ?? `\${${expr}}`;
};

const hasInterpolation = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    if (isInterpolationStart(text, i)) return true;
  }
  return false;
};

/**
 * The expression stored for an edited text: a plain single-quoted string literal when the text has
 * no `${…}` (every compiler target supports those), otherwise a template literal with the
 * interpolations kept verbatim and only the literal text escaped.
 */
export const textValueToExpression = (text: string): string => {
  if (!hasInterpolation(text)) {
    const escaped = text
      .replaceAll('\\', String.raw`\\`)
      .replaceAll("'", String.raw`\'`)
      .replaceAll('\r', String.raw`\r`)
      .replaceAll('\n', String.raw`\n`);
    return `'${escaped}'`;
  }
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (isInterpolationStart(text, i)) {
      const end = skipInterpolation(text, i);
      result += text.slice(i, end);
      i = end;
      continue;
    }
    const ch = text[i];
    result += ch === '\\' || ch === '`' ? `\\${ch}` : ch;
    i += 1;
  }
  return `\`${result}\``;
};
