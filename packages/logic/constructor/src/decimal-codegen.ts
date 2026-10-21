import type { TNumberTypeDetail } from '@falang/typescript-dto';

/**
 * What a target must supply to compile `decimal(D, S)` arithmetic (ADR 0069 (private) §4). Every operation works on
 * decimals of one scale: `walk-decimal.ts` rescales the operands first (widening is exact), so a target only needs the
 * same-scale primitives plus the conversions at the edges. A `code` argument is a value already in the target's
 * decimal representation at the stated scale.
 */
export interface IDecimalCodegen {
  /** The exact decimal `raw × 10^-scale`. */
  literal(raw: bigint, scale: number): string;
  /** An integer-typed value as a decimal at `scale` (exact). */
  fromInteger(code: string, from: TNumberTypeDetail, scale: number): string;
  /** A float-typed value rounded (half away from zero) to a decimal at `scale`. */
  fromFloat(code: string, scale: number): string;
  /** Decimal → decimal of another scale: exact when widening, rounded half away from zero when narrowing. */
  rescale(code: string, from: number, to: number): string;
  /** Decimal → an integer type, truncating toward zero. */
  toInteger(code: string, scale: number, to: TNumberTypeDetail): string;
  /** Decimal → a float type. */
  toFloat(code: string, scale: number, to: TNumberTypeDetail): string;
  /** `+ - * / %` and the comparisons (`operator` already mapped to the C-like spelling), both operands at `scale`. */
  arithmetic(operator: string, left: string, right: string, scale: number): string;
  /** A text (string-typed) value with exactly `scale` fraction digits. */
  print(code: string, scale: number): string;
}

export const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(['<', '<=', '>', '>=', '==', '!=']);
