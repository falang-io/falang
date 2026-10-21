/**
 * TS / JS decimals (ADR 0069 (private) §4): a plain `number` holding the real value (`19.99`, so host code passes
 * `19.99`, not `1999`). `+ -` are done on the doubles and snapped back to the scale; `*`, `/`, `%`, rescaling and
 * float conversion go through scaled `BigInt`s, so the result is exact and rounded half away from zero — the same
 * lines every other target prints. Exact up to 15 significant digits (what a `number` can hold).
 */
export const FALANG_DECIMAL_TS_FILE_NAME = '_falang_decimal';

export const FALANG_DECIMAL_TS_FUNCTIONS = [
  'falangDecAdd',
  'falangDecSub',
  'falangDecMul',
  'falangDecDiv',
  'falangDecMod',
  'falangDecRescale',
  'falangDecFromFloat',
  'falangDecStr',
] as const;

export const FALANG_DECIMAL_TS_RUNTIME = `const pow10 = (scale: number): number => 10 ** scale;

const bigPow10 = (scale: number): bigint => 10n ** BigInt(scale);

const toRaw = (value: number, scale: number): bigint => BigInt(Math.round(value * pow10(scale)));

const fromRaw = (raw: bigint, scale: number): number => Number(raw) / pow10(scale);

// Half away from zero.
const divRound = (numerator: bigint, denominator: bigint): bigint => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (absRemainder * 2n < absDenominator) return quotient;
  return (numerator < 0n) === (denominator < 0n) ? quotient + 1n : quotient - 1n;
};

export function falangDecAdd(a: number, b: number, scale: number): number {
  return fromRaw(toRaw(a + b, scale), scale);
}

export function falangDecSub(a: number, b: number, scale: number): number {
  return fromRaw(toRaw(a - b, scale), scale);
}

export function falangDecMul(a: number, b: number, scale: number): number {
  return fromRaw(divRound(toRaw(a, scale) * toRaw(b, scale), bigPow10(scale)), scale);
}

export function falangDecDiv(a: number, b: number, scale: number): number {
  return fromRaw(divRound(toRaw(a, scale) * bigPow10(scale), toRaw(b, scale)), scale);
}

export function falangDecMod(a: number, b: number, scale: number): number {
  return fromRaw(toRaw(a, scale) % toRaw(b, scale), scale);
}

// Widening is exact, narrowing rounds.
export function falangDecRescale(value: number, from: number, to: number): number {
  return to >= from ? value : fromRaw(divRound(toRaw(value, from), bigPow10(from - to)), to);
}

export function falangDecFromFloat(value: number, scale: number): number {
  return fromRaw(BigInt(Math.trunc(value * pow10(scale) + (value < 0 ? -0.5 : 0.5))), scale);
}

export function falangDecStr(value: number, scale: number): string {
  return value.toFixed(scale);
}
`;
