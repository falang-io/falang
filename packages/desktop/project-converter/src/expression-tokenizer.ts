/**
 * Tokenizer for `convert-expression.ts`'s small hand-written mathjs-expression parser
 * (`expression-parser.ts`) — split into its own file purely to keep that file under `oxlint`'s
 * `max-lines`, the same reasoning `convert-logic-leaf.ts`'s own module doc gives for being split out
 * of `convert-logic-project.ts`. String literals are consumed whole (never inspected for keyword
 * tokens inside), matching this whole module's "`and`/`or`/etc. can never be found inside a string"
 * guarantee.
 */

export interface IToken {
  readonly type: 'num' | 'str' | 'ident' | 'punct';
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/** Multi-character punctuation must be tried before its single-character prefix (`==` before `=`). */
const PUNCTS = ['==', '!=', '<=', '>=']
  .concat([
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    ',',
    '.',
    ':',
    ';',
    '?',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
    '<',
    '>',
    '!',
    '&',
    '|',
    '~',
  ])
  .toSorted((a, b) => b.length - a.length);

const matchPunctAt = (source: string, from: number): string | undefined =>
  PUNCTS.find((p) => source.startsWith(p, from));

export const tokenize = (source: string): IToken[] => {
  const tokens: IToken[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        j += source[j] === '\\' ? 2 : 1;
      }
      if (j >= source.length) throw new Error(`Unterminated string literal at position ${i}`);
      // Advance past the closing quote itself.
      j += 1;
      tokens.push({ type: 'str', value: source.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const match = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(source.slice(i));
      if (!match) throw new Error(`Invalid number literal at position ${i}`);
      tokens.push({ type: 'num', value: match[0], start: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(i));
      if (!match) throw new Error(`Invalid identifier at position ${i}`);
      tokens.push({ type: 'ident', value: match[0], start: i, end: i + match[0].length });
      i += match[0].length;
      continue;
    }
    const punct = matchPunctAt(source, i);
    if (!punct) throw new Error(`Unexpected character "${ch}" at position ${i}`);
    tokens.push({ type: 'punct', value: punct, start: i, end: i + punct.length });
    i += punct.length;
  }
  return tokens;
};
