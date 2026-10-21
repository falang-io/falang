/**
 * Compile-time decimal arithmetic on source text (ADR 0069 (private) §4): a numeric literal is parsed from its
 * spelling into an exact `raw × 10^-scale` pair, never through a binary float.
 */

export interface IDecimalValue {
  readonly raw: bigint;
  readonly scale: number;
}

const DECIMAL_LITERAL_PATTERN = /^(\d[\d_]*)?(?:\.(\d[\d_]*)?)?(?:[eE]([+-]?\d+))?$/;

const pow10 = (exponent: number): bigint => 10n ** BigInt(exponent);

/** `19.99` → `{ raw: 1999n, scale: 2 }`, `1e3` → `{ raw: 1000n, scale: 0 }`; `undefined` for hex/binary/bigint spellings. */
export const parseDecimalLiteral = (text: string): IDecimalValue | undefined => {
  const match = DECIMAL_LITERAL_PATTERN.exec(text);
  if (!match || (typeof match[1] !== 'string' && typeof match[2] !== 'string')) return;
  const integerPart = (match[1] ?? '').replaceAll('_', '');
  const fractionPart = (match[2] ?? '').replaceAll('_', '');
  const exponent = typeof match[3] === 'string' ? Number(match[3]) : 0;
  const digits = BigInt(`${integerPart}${fractionPart}` || '0');
  const scale = fractionPart.length - exponent;
  return scale >= 0 ? { raw: digits, scale } : { raw: digits * pow10(-scale), scale: 0 };
};

/** Half away from zero. */
export const divideRounded = (numerator: bigint, denominator: bigint): bigint => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  if (absRemainder * 2n < absDenominator) return quotient;
  return numerator < 0n === denominator < 0n ? quotient + 1n : quotient - 1n;
};

/** The value's raw at another scale — exact when widening, half away from zero when narrowing. */
export const rescaleDecimalValue = (value: IDecimalValue, scale: number): bigint =>
  scale >= value.scale ? value.raw * pow10(scale - value.scale) : divideRounded(value.raw, pow10(value.scale - scale));

/** `-5n, 2` → `-0.05`; scale 0 → no point. */
export const formatDecimalText = (raw: bigint, scale: number): string => {
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(scale + 1, '0');
  const integerPart = digits.slice(0, digits.length - scale);
  const text = scale === 0 ? integerPart : `${integerPart}.${digits.slice(digits.length - scale)}`;
  return negative ? `-${text}` : text;
};

export const decimalPow10 = pow10;
