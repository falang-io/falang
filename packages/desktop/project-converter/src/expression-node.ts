/**
 * `IExprNode`/`leaf`/`compose` for `expression-parser.ts` — split into its own file purely to keep
 * that file under `oxlint`'s `max-lines`, same reasoning `expression-tokenizer.ts`'s own module doc
 * gives.
 */

/** A parsed (sub)expression: its span in the original source, plus how to render its own text. */
export interface IExprNode {
  readonly start: number;
  readonly end: number;
  /** Set only for a bare identifier primary — lets `parsePostfix` recognize `sin(...)`/`random()` without also matching `obj.sin(...)`. */
  readonly identName?: string;
  text(): string;
}

export const leaf = (start: number, end: number, value: string): IExprNode => ({ start, end, text: () => value });

/**
 * Builds a node covering `[start, end)` whose text is the original source with each of `holes`
 * (given in left-to-right source order) replaced by that hole's own `text()` — everything between
 * and around the holes (operator tokens, punctuation, whitespace) is copied from `source` verbatim.
 * A node built this way naturally reproduces its input character-for-character whenever none of its
 * holes rewrite anything, with no separate "did anything change" bookkeeping needed.
 */
export const compose = (source: string, start: number, end: number, holes: readonly IExprNode[]): IExprNode => ({
  start,
  end,
  text: () => {
    let result = '';
    let cursor = start;
    for (const hole of holes) {
      result += source.slice(cursor, hole.start) + hole.text();
      cursor = hole.end;
    }
    return result + source.slice(cursor, end);
  },
});
