import { describe, expect, it } from 'vitest';
import { compileExpressionWithAdapter, FALANG_DECIMAL_CPP_RUNTIME } from '@falang/logic-constructor';
import type { TVariableInfo } from '@falang/typescript-dto';
import { arduinoAdapter } from './arduino-adapter.js';

const decimal: TVariableInfo = { type: 'number', numberType: { type: 'decimal', digits: 10, decimals: 2 } };
const int32: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('Arduino adapter with decimals (ADR 0069 (private) §4)', () => {
  const compile = (expression: string) => {
    const result = compileExpressionWithAdapter({
      expression,
      scope: { p: decimal, n: int32 },
      adapter: arduinoAdapter,
    });
    if (!result.ok) throw new Error(result.diagnostics.join('\n'));
    return result.code;
  };

  it('prints a decimal in a template literal through the Arduino String class', () => {
    expect(compile('`price ${p} for ${n}`')).toBe(
      '(String("price ") + String((p).str()) + String(" for ") + String(n)).c_str()',
    );
  });

  it('shares the C++ decimal arithmetic', () => {
    expect(compile('p * n')).toBe('(p * FalangDecimal<2>(n))');
  });

  it('keeps the inlined runtime free of free functions and standard-library headers on AVR', () => {
    const avrPart = FALANG_DECIMAL_CPP_RUNTIME.split('#else')[0] ?? '';
    expect(avrPart).toContain('#include <Arduino.h>');
    // Everything the Arduino sketch preprocessor could mistake for a free function is a member or a hidden friend.
    expect(FALANG_DECIMAL_CPP_RUNTIME).not.toMatch(
      /^(?:inline |static )?[A-Za-z_][\w:<>*& ]* [A-Za-z_]\w*\([^)]*\) \{/m,
    );
    expect(FALANG_DECIMAL_CPP_RUNTIME).not.toContain('#include <type_traits>');
  });
});
