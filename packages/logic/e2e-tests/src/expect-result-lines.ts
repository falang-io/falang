/**
 * Asserts `actual` matches `expected` line-by-line, porting the old app's own comparison convention
 * from `old/packages/tests/logic-compile-and-run/src/index.ts` (not invented here) rather than the
 * plain `toEqual` every other migrated project's `compile-and-run-*.test.ts` uses: an expected line
 * ending in `***` is a *prefix* match (`current.startsWith(need.slice(0, -3))`), everything else is
 * exact equality. Needed only for MonteCarlo, whose pi estimate is genuinely non-deterministic
 * (depends on `Math.random`) — see ADR 0019 (private)'s MonteCarlo implementation notes.
 */
export const expectResultLinesMatch = (actual: readonly string[], expected: readonly string[]): void => {
  for (let index = 0; index < expected.length; index += 1) {
    const need = expected[index];
    const current = actual[index] ?? '';
    const matches = need.endsWith('***') ? current.startsWith(need.slice(0, -3)) : current === need;
    if (!matches) {
      throw new Error(`Result line ${index + 1} mismatch.\nNeed: ${need}\nGot:  ${current}`);
    }
  }
};
