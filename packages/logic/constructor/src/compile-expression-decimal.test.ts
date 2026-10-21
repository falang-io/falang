import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileExpression } from './compile-expression.js';

const decimal = (decimals: number): TVariableInfo => ({
  type: 'number',
  numberType: { type: 'decimal', digits: 10, decimals },
});
const int32: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const float64: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

const scope = { a: decimal(2), b: decimal(3), i: int32, f: float64 };

const compile = (
  expression: string,
  target: 'cpp' | 'golang' | 'rust' | 'sharp' | 'ts' | 'js',
  extra: { targetType?: TVariableInfo; print?: boolean } = {},
): string => {
  const result = compileExpression({ expression, scope, target, ...extra });
  if (!result.ok) throw new Error(result.diagnostics.join('\n'));
  return result.code;
};

describe('decimal expressions (ADR 0069 (private) §4)', () => {
  describe('C++', () => {
    it('widens the narrower operand and keeps one scale per operation', () => {
      expect(compile('a + b', 'cpp')).toBe('(FalangDecimal<3>(a) + b)');
      expect(compile('a * i', 'cpp')).toBe('(a * FalangDecimal<2>(i))');
    });

    it('reads literals exactly, from their source text', () => {
      expect(compile('a + 0.1', 'cpp')).toBe('(a + FalangDecimal<2>::fromRaw(10LL))');
      expect(compile('a == 1.25', 'cpp')).toBe('(a == FalangDecimal<2>::fromRaw(125LL))');
      expect(compile('a + 0.125', 'cpp')).toBe('(FalangDecimal<3>(a) + FalangDecimal<3>::fromRaw(125LL))');
    });

    it('rounds a literal stored into a decimal target, half away from zero', () => {
      expect(compile('1.005', 'cpp', { targetType: decimal(2) })).toBe('FalangDecimal<2>::fromRaw(101LL)');
      expect(compile('-2.5', 'cpp', { targetType: decimal(0) })).toBe('FalangDecimal<0>::fromRaw(-3LL)');
    });

    it('converts at the edges: integer, float, narrower decimal, integer target', () => {
      expect(compile('i', 'cpp', { targetType: decimal(2) })).toBe('FalangDecimal<2>(i)');
      expect(compile('f', 'cpp', { targetType: decimal(2) })).toBe('FalangDecimal<2>(f)');
      expect(compile('a', 'cpp', { targetType: decimal(1) })).toBe('FalangDecimal<1>(a)');
      expect(compile('a', 'cpp', { targetType: int32 })).toBe('static_cast<int32_t>((a).toInt64())');
    });

    it('turns a decimal in a float operation into a float, and prints with its scale', () => {
      expect(compile('a * f', 'cpp')).toBe('static_cast<double>((a).toDouble()) * f');
      expect(compile('`v=${a}`', 'cpp')).toContain('(a).str()');
      expect(compile('a', 'cpp', { print: true })).toBe('(a).str()');
    });

    it('stores a compound assignment as an assignment of the converted result', () => {
      expect(compile('a += 0.125', 'cpp')).toBe(
        'a = FalangDecimal<2>((FalangDecimal<3>(a) + FalangDecimal<3>::fromRaw(125LL)))',
      );
    });
  });

  describe('Go', () => {
    it('keeps the raw int64 and rescales with multiplications', () => {
      expect(compile('a + b', 'golang')).toBe('((a * 10) + b)');
      expect(compile('a * i', 'golang')).toBe('falangDecMul(a, (int64(i) * 100), 2)');
      expect(compile('a / 3', 'golang')).toBe('falangDecDiv(a, int64(300), 2)');
    });

    it('converts at the edges', () => {
      expect(compile('f', 'golang', { targetType: decimal(2) })).toBe('falangDecFromFloat(float64(f), 2)');
      expect(compile('a', 'golang', { targetType: int32 })).toBe('int32(a / 100)');
      expect(compile('a', 'golang', { print: true })).toBe('falangDecStr(a, 2)');
    });
  });

  describe('Rust', () => {
    it('rescales explicitly and uses the operators of one scale', () => {
      expect(compile('a + b', 'rust')).toBe('((a).rescale::<3>() + b)');
      expect(compile('a * i', 'rust')).toBe('(a * FalangDecimal::<2>::from_int((i) as i64))');
      expect(compile('a', 'rust', { targetType: int32 })).toBe('((a).to_i64() as i32)');
    });

    it('prints through Display', () => {
      expect(compile('a', 'rust', { print: true })).toBe('a');
    });
  });

  describe('C#', () => {
    it('uses decimal and rounds every product, quotient and store', () => {
      expect(compile('a + b', 'sharp')).toBe('(a + b)');
      expect(compile('a * i', 'sharp')).toBe('FalangDec.Round(a * ((decimal)(i)), 2)');
      expect(compile('a / 3', 'sharp')).toBe('FalangDec.Round(a / 3.00m, 2)');
      expect(compile('a', 'sharp', { targetType: decimal(1) })).toBe('FalangDec.Round(a, 1)');
      expect(compile('a', 'sharp', { print: true })).toBe('FalangDec.Str(a, 2)');
    });
  });

  describe('TS / JS', () => {
    it('calls the helpers with the result scale', () => {
      expect(compile('a + b', 'ts')).toBe('falangDecAdd(a, b, 3)');
      expect(compile('a * i', 'ts')).toBe('falangDecMul(a, i, 2)');
      expect(compile('(a + b) * (a - b)', 'ts')).toBe(
        'falangDecMul((falangDecAdd(a, b, 3)), (falangDecSub(a, b, 3)), 3)',
      );
      expect(compile('a * f', 'ts')).toBe('a * f');
      expect(compile('a < b', 'ts')).toBe('a < b');
    });

    it('nests the wrap of a store around the wrap of the operation', () => {
      expect(compile('a = b * 2', 'ts')).toBe('a = falangDecRescale(falangDecMul(b, 2, 3), 3, 2)');
      expect(compile('a += 0.125', 'ts')).toBe('a = falangDecRescale(falangDecAdd(a, 0.125, 3), 3, 2)');
      expect(compile('i = a', 'ts')).toBe('i = Math.trunc(a)');
    });

    it('converts at the edges and prints with the scale', () => {
      expect(compile('1.005', 'ts', { targetType: decimal(2) })).toBe('1.01');
      expect(compile('f', 'ts', { targetType: decimal(2) })).toBe('falangDecFromFloat(f, 2)');
      expect(compile('a', 'ts', { targetType: int32 })).toBe('Math.trunc(a)');
      expect(compile('`v=${a}`', 'ts')).toBe('`v=${falangDecStr(a, 2)}`');
      expect(compile('a * b', 'ts', { print: true })).toBe('falangDecStr(falangDecMul(a, b, 3), 3)');
    });

    it('leaves the same calls in JS', () => {
      expect(compile('a * i', 'js')).toBe('falangDecMul(a, i, 2)');
    });
  });
});
