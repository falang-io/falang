import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { createArduinoTracer } from './arduino-tracer.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const floatType: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float32' } };
const boolType: TVariableInfo = { type: 'boolean' };
const arrayType: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };

describe('createArduinoTracer', () => {
  it('emitEnter declares the RAII call-depth guard; emitLeave is a no-op (the guard handles every return path)', () => {
    const tracer = createArduinoTracer();
    expect(tracer.emitEnter()).toBe('FalangDebugFrame __falang_frame;');
    expect(tracer.emitLeave()).toBe('');
  });

  it('emits an empty falang_trace block when nothing is in scope', () => {
    const tracer = createArduinoTracer();
    expect(tracer.emitTrace({ id: 'n1', name: 'log' }, 3, {})).toBe(
      ['if (falang_trace(3)) {', '  falang_pause();', '}'].join('\n'),
    );
  });

  it('casts each traced variable to the falang_var overload matching its type, in scope order', () => {
    const tracer = createArduinoTracer();
    const scope = { x: int32Type, y: floatType, flag: boolType };
    expect(tracer.emitTrace({ id: 'n1', name: 'log' }, 0, scope)).toBe(
      [
        'if (falang_trace(0)) {',
        '  falang_var(0, (int32_t)x);',
        '  falang_var(1, (float)y);',
        '  falang_var(2, (bool)flag);',
        '  falang_pause();',
        '}',
      ].join('\n'),
    );
  });

  it('selectVariables drops types falang_var has no overload for (arrays/structs/strings)', () => {
    const tracer = createArduinoTracer();
    const scope = { items: arrayType, count: int32Type };
    expect(tracer.selectVariables?.(scope)).toEqual({ count: int32Type });
  });

  it('emitTrace only ever sees what selectVariables already narrowed — varIdx stays dense over the traced subset', () => {
    const tracer = createArduinoTracer();
    const scope = { items: arrayType, count: int32Type };
    const traced = tracer.selectVariables?.(scope) ?? scope;
    expect(tracer.emitTrace({ id: 'n1', name: 'log' }, 5, traced)).toBe(
      ['if (falang_trace(5)) {', '  falang_var(0, (int32_t)count);', '  falang_pause();', '}'].join('\n'),
    );
  });
});
