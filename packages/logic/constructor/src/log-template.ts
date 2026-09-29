export interface ITemplateSegment {
  readonly isExpr: boolean;
  readonly text: string;
}

/** Returns the index just past the quoted string starting at `start` (which must point at the opening quote), respecting `\`-escapes — same helper `@falang/workflow-compiler`'s `escape-template-literal.ts` uses to keep a `}` inside a string from ending an interpolation early. */
const skipQuotedString = (value: string, start: number): number => {
  const quote = value[start];
  let i = start + 1;
  while (i < value.length && value[i] !== quote) i += value[i] === '\\' ? 2 : 1;
  return i + 1;
};

/**
 * Splits a `log` node's template-literal-body text into literal/`${...}` segments — shared by every
 * target's leaf emitters (`cpp-leaf-emitters.ts`, `go-leaf-emitters.ts`, …) that need to translate a
 * `log` node's interpolated text into their own language's concatenation/formatting syntax. A local
 * copy of `@falang/workflow-compiler`'s `escape-template-literal.ts` splitting logic (not exported
 * from that package, and `packages/logic/*` deliberately doesn't depend on `packages/workflow/*`, see
 * ADR 0002 (private)). Doesn't handle a nested template literal inside an interpolation, same
 * limitation as the original.
 */
export const splitLogSegments = (value: string): ITemplateSegment[] => {
  const segments: ITemplateSegment[] = [];
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
      segments.push({ isExpr: true, text: value.slice(exprStart + 2, i - 1) });
      continue;
    }
    buffer += value[i];
    i += 1;
  }
  if (buffer !== '') segments.push({ isExpr: false, text: buffer });
  return segments;
};
