import { describe, expect, it } from 'vitest';
import type { TIntegerType, TVariableInfo } from '@falang/typescript-dto';
import { variableInfoToCppType } from './cpp-type-name.js';
import { variableInfoToGoType } from './golang-type-name.js';
import { variableInfoToRustType } from './rust-type-name.js';
import { variableInfoToSharpType } from './sharp-type-name.js';
import { promoteNumberType } from './numeric-coercion.js';
import { compileExpression } from './compile-expression.js';

const integer = (integerType: TIntegerType): TVariableInfo => ({
  type: 'number',
  numberType: { type: 'integer', integerType },
});

describe('fixed-width integer mappings (ADR 0069 (private) §2)', () => {
  const expected: Record<TIntegerType, [string, string, string, string]> = {
    int8: ['int8_t', 'int8', 'i8', 'sbyte'],
    uint8: ['uint8_t', 'uint8', 'u8', 'byte'],
    int16: ['int16_t', 'int16', 'i16', 'short'],
    uint16: ['uint16_t', 'uint16', 'u16', 'ushort'],
    int32: ['int32_t', 'int32', 'i32', 'int'],
    uint32: ['uint32_t', 'uint32', 'u32', 'uint'],
    int64: ['int64_t', 'int64', 'i64', 'long'],
    uint64: ['uint64_t', 'uint64', 'u64', 'ulong'],
  };

  it.each(Object.entries(expected))('%s maps to the fixed-width type of every target', (width, names) => {
    const type = integer(width as TIntegerType);
    expect([
      variableInfoToCppType(type, new Map()),
      variableInfoToGoType(type, new Map()),
      variableInfoToRustType(type, new Map()),
      variableInfoToSharpType(type, new Map()),
    ]).toEqual(names);
  });
});

const detail = (integerType: TIntegerType) => ({ type: 'integer', integerType }) as const;

describe('promotion rank', () => {
  it('the wider width wins and, at equal width, the unsigned one', () => {
    expect(promoteNumberType(detail('int8'), detail('uint8'))).toEqual(detail('uint8'));
    expect(promoteNumberType(detail('uint8'), detail('int16'))).toEqual(detail('int16'));
    expect(promoteNumberType(detail('int32'), detail('uint32'))).toEqual(detail('uint32'));
    expect(promoteNumberType(detail('uint32'), detail('int64'))).toEqual(detail('int64'));
    expect(promoteNumberType(detail('uint64'), detail('int64'))).toEqual(detail('uint64'));
  });

  it('a float outranks every integer', () => {
    const float32 = { type: 'float', floatType: 'float32' } as const;
    expect(promoteNumberType(detail('uint64'), float32)).toEqual(float32);
  });
});

describe('integer semantics in the ts target (ADR 0069 (private) §3)', () => {
  const scope: Record<string, TVariableInfo> = {
    a: integer('int32'),
    b: integer('uint8'),
    f: { type: 'number', numberType: { type: 'float', floatType: 'float64' } },
  };
  const compile = (expression: string, targetType?: TVariableInfo, target: 'ts' | 'js' = 'ts') => {
    const result = compileExpression({ expression, scope, target, ...(targetType ? { targetType } : {}) });
    if (!result.ok) throw new Error(result.diagnostics.join('\n'));
    return result.code;
  };

  it('truncates a division of two integers, a literal adopting the other integer type', () => {
    expect(compile('a / b')).toBe('Math.trunc(a / b)');
    expect(compile('a / 2')).toBe('Math.trunc(a / 2)');
    expect(compile('a / b / 3')).toBe('Math.trunc(Math.trunc(a / b) / 3)');
  });

  it('keeps float arithmetic and an unresolvable operand alone', () => {
    expect(compile('f / 2')).toBe('f / 2');
    expect(compile('a / f')).toBe('a / f');
    expect(compile('a / Math.sqrt(4)')).toBe('a / Math.sqrt(4)');
  });

  it('truncates a float stored into an integer target and leaves an integer alone', () => {
    expect(compile('f * 2', integer('int32'))).toBe('Math.trunc(f * 2)');
    expect(compile('a * 2', integer('int32'))).toBe('a * 2');
    expect(compile('f * 2', scope['f'])).toBe('f * 2');
    expect(compile('Math.sqrt(a)', integer('int32'))).toBe('Math.trunc(Math.sqrt(a))');
  });

  it('truncates a float assigned to an integer variable inside the expression', () => {
    expect(compile('a = f * 2')).toBe('a = Math.trunc(f * 2)');
  });

  it('applies to the js target too', () => {
    expect(compile('a / b', scope['a'], 'js')).toBe('Math.trunc(a / b)');
  });
});

describe('8-bit integers print as numbers in the cpp target', () => {
  it('casts an 8-bit interpolation to int in a template literal', () => {
    const result = compileExpression({
      expression: '`v=${b}`',
      scope: { b: integer('uint8'), c: integer('int32') },
      target: 'cpp',
    });
    expect(result).toEqual({
      ok: true,
      code: '([&]{ std::ostringstream _oss; _oss << "v=" << static_cast<int>(b); return _oss.str(); }())',
    });
  });
});
