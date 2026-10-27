/**
 * Constant-time string equality for shared-secret/signature checks. No `node:crypto` on purpose: `common` (and the vendor
 * packages built on it) is reachable from the browser bundle. A length difference is folded into the accumulator instead of
 * returning early, so only the length (never the content) of the expected value can leak through timing.
 */
export const constantTimeEqual = (left: string, right: string): boolean => {
  // oxlint-disable no-bitwise -- bitwise accumulation is what makes the comparison constant-time.
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left.codePointAt(index) ?? 0) ^ (right.codePointAt(index) ?? 0);
  }
  // oxlint-enable no-bitwise
  return diff === 0;
};
