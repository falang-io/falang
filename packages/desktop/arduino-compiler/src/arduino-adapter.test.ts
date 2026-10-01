import { describe, expect, it } from 'vitest';
import { UnsupportedConstructError } from '@falang/logic-constructor';
import { arduinoAdapter } from './arduino-adapter.js';

describe('arduinoAdapter', () => {
  it('emits an Arduino builtin as a plain passthrough call', () => {
    expect(arduinoAdapter.emitCall({ qualifiedCalleeText: 'digitalWrite', argCodes: ['13', 'HIGH'] })).toBe(
      'digitalWrite(13, HIGH)',
    );
  });

  it('falls back to cppAdapter for a call not in the Arduino whitelist (e.g. Math.pow)', () => {
    expect(arduinoAdapter.emitCall({ qualifiedCalleeText: 'Math.pow', argCodes: ['2', '3'] })).toBe('std::pow(2, 3)');
  });

  it('throws for a call in neither whitelist', () => {
    expect(() => arduinoAdapter.emitCall({ qualifiedCalleeText: 'someUnknownCall', argCodes: [] })).toThrow(
      UnsupportedConstructError,
    );
  });

  it('inherits cpp operator mapping unchanged (e.g. === collapses to ==, C++ has no strict-equality operator)', () => {
    expect(arduinoAdapter.mapBinaryOperator('===')).toBe('==');
  });

  it('inherits cpp string-literal escaping unchanged', () => {
    expect(arduinoAdapter.formatStringLiteral('hi')).toBe('"hi"');
  });

  it("emits a template literal via the Arduino String class ending in .c_str(), overriding cppAdapter's <sstream>-based default", () => {
    const segments = [
      { isExpr: false, text: 'Hello, ' },
      { isExpr: true, text: 'name' },
    ];
    expect(arduinoAdapter.emitTemplateLiteral?.({ segments })).toBe('(String("Hello, ") + String(name)).c_str()');
  });

  it('emits an empty template literal as an empty Arduino String', () => {
    expect(arduinoAdapter.emitTemplateLiteral?.({ segments: [] })).toBe('(String("")).c_str()');
  });
});
