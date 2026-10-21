import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { FALANG_DECIMAL_TS_FUNCTIONS } from './ts-decimal.js';
import { FALANG_DECIMAL_TS_RUNTIME } from './ts-decimal.js';

type TDec = Record<(typeof FALANG_DECIMAL_TS_FUNCTIONS)[number], (...args: number[]) => number | string>;

const loadRuntime = (): TDec => {
  const { outputText } = ts.transpileModule(FALANG_DECIMAL_TS_RUNTIME, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} as Record<string, unknown> };
  // oxlint-disable-next-line no-new-func -- evaluating the generated runtime is the point of this test
  new Function('exports', 'module', outputText)(module.exports, module);
  return module.exports as unknown as TDec;
};

describe('TS decimal runtime (ADR 0069 (private) §4)', () => {
  const dec = loadRuntime();

  it('adds and subtracts exactly where doubles drift', () => {
    expect(dec.falangDecAdd(0.1, 0.2, 1)).toBe(0.3);
    expect(dec.falangDecSub(0.3, 0.1, 1)).toBe(0.2);
    expect(dec.falangDecAdd(19.99, 0.075, 3)).toBe(20.065);
  });

  it('multiplies and divides rounding half away from zero', () => {
    expect(dec.falangDecMul(19.99, 0.075, 3)).toBe(1.499);
    expect(dec.falangDecMul(0.01, 4.5, 2)).toBe(0.05);
    expect(dec.falangDecMul(-0.01, 4.5, 2)).toBe(-0.05);
    expect(dec.falangDecDiv(19.99, 3, 2)).toBe(6.66);
    expect(dec.falangDecDiv(2, 3, 2)).toBe(0.67);
    expect(dec.falangDecDiv(-2, 3, 2)).toBe(-0.67);
    expect(dec.falangDecDiv(1, 8, 3)).toBe(0.125);
  });

  it('keeps the dividend sign on the remainder', () => {
    expect(dec.falangDecMod(19.99, 5, 2)).toBe(4.99);
    expect(dec.falangDecMod(-19.99, 5, 2)).toBe(-4.99);
  });

  it('rescales: widening is free, narrowing rounds', () => {
    expect(dec.falangDecRescale(1.005, 3, 2)).toBe(1.01);
    expect(dec.falangDecRescale(-2.675, 3, 2)).toBe(-2.68);
    expect(dec.falangDecRescale(-2.5, 1, 0)).toBe(-3);
    expect(dec.falangDecRescale(1.5, 1, 3)).toBe(1.5);
  });

  it('rounds a float to the scale', () => {
    expect(dec.falangDecFromFloat(7.5, 2)).toBe(7.5);
    expect(dec.falangDecFromFloat(2.5, 0)).toBe(3);
    expect(dec.falangDecFromFloat(-2.5, 0)).toBe(-3);
  });

  it('prints exactly `scale` fraction digits', () => {
    expect(dec.falangDecStr(12.5, 2)).toBe('12.50');
    expect(dec.falangDecStr(-0.05, 2)).toBe('-0.05');
    expect(dec.falangDecStr(0, 2)).toBe('0.00');
    expect(dec.falangDecStr(3, 0)).toBe('3');
  });
});
