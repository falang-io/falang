const DURATION_UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/;

/**
 * Parses a plain duration string (`'48h'`/`'3d'`/`'10m'`/`'30s'`, optionally `'<n>ms'`) into
 * milliseconds — used by `IQuestionDescriptor.timeoutField` (`question-emitters.ts`'s
 * `condition(() => ..., ms)` timeout arg, see ADR 0040 (private) §4).
 * Throws on anything that doesn't match (including the empty string) — a caller treats an empty
 * field value as "no timeout" itself, before ever calling this, rather than expecting it to return a
 * sentinel.
 */
export const parseDurationToMs = (text: string): number => {
  const match = DURATION_PATTERN.exec(text.trim());
  if (!match) {
    throw new Error(`Invalid duration "${text}" — expected a number followed by one of ms/s/m/h/d, e.g. "10m".`);
  }
  const [, amount, unit] = match;
  return Number(amount) * DURATION_UNIT_MS[unit];
};
