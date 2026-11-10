import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  clampSelection,
  deletesIntoHidden,
  extractValue,
  isModelTextIntact,
  type IVisibleRange,
} from './hidden-range-guard.js';

const prefix = 'declare const a: number;\n';
const suffix = '\nexport {};';
// Line 1 hidden, lines 2-3 visible ("a +" / "1"), line 4 hidden.
const visible: IVisibleRange = { start: { lineNumber: 2, column: 1 }, end: { lineNumber: 3, column: 2 } };

const selection = (anchorLine: number, anchorCol: number, headLine: number, headCol: number) => ({
  selectionStartLineNumber: anchorLine,
  selectionStartColumn: anchorCol,
  positionLineNumber: headLine,
  positionColumn: headCol,
});

describe('isModelTextIntact / extractValue', () => {
  it('accepts prefix + value + suffix and extracts the value', () => {
    const text = `${prefix}a +\n1${suffix}`;
    expect(isModelTextIntact(text, prefix, suffix)).toBe(true);
    expect(extractValue(text, prefix, suffix)).toBe('a +\n1');
  });

  it('accepts an empty value', () => {
    expect(isModelTextIntact(`${prefix}${suffix}`, prefix, suffix)).toBe(true);
    expect(extractValue(`${prefix}${suffix}`, prefix, suffix)).toBe('');
  });

  it('rejects text where an edit reached the hidden lines', () => {
    // Select-all + typing.
    expect(isModelTextIntact('x', prefix, suffix)).toBe(false);
    // Backspace at the start of the value joined it with the prefix line.
    expect(isModelTextIntact(`declare const a: number;a${suffix}`, prefix, suffix)).toBe(false);
    // Delete at the end of the value joined it with the suffix line.
    expect(isModelTextIntact(`${prefix}aexport {};`, prefix, suffix)).toBe(false);
    // The value line itself was removed: prefix and suffix overlap on the newline.
    expect(isModelTextIntact('declare const a: number;\nexport {};', prefix, suffix)).toBe(false);
  });
});

describe('clampPosition / clampSelection', () => {
  it('moves positions in the hidden lines to the visible bounds', () => {
    expect(clampPosition({ lineNumber: 1, column: 5 }, visible)).toEqual(visible.start);
    expect(clampPosition({ lineNumber: 4, column: 1 }, visible)).toEqual(visible.end);
    expect(clampPosition({ lineNumber: 3, column: 5 }, visible)).toEqual(visible.end);
    expect(clampPosition({ lineNumber: 2, column: 3 }, visible)).toEqual({ lineNumber: 2, column: 3 });
  });

  it('turns select-all into a selection of the visible text', () => {
    expect(clampSelection(selection(1, 1, 4, 11), visible)).toEqual(selection(2, 1, 3, 2));
  });

  it('keeps the selection direction', () => {
    expect(clampSelection(selection(4, 11, 1, 1), visible)).toEqual(selection(3, 2, 2, 1));
  });

  it('returns null for a selection already inside', () => {
    expect(clampSelection(selection(2, 1, 3, 2), visible)).toBeNull();
    expect(clampSelection(selection(2, 2, 2, 2), visible)).toBeNull();
  });
});

describe('deletesIntoHidden', () => {
  it('detects Backspace at the visible start and Delete at the visible end', () => {
    expect(deletesIntoHidden('left', [selection(2, 1, 2, 1)], visible)).toBe(true);
    expect(deletesIntoHidden('right', [selection(3, 2, 3, 2)], visible)).toBe(true);
  });

  it('allows deletes elsewhere and over a non-empty selection', () => {
    expect(deletesIntoHidden('left', [selection(2, 2, 2, 2)], visible)).toBe(false);
    expect(deletesIntoHidden('right', [selection(2, 1, 2, 1)], visible)).toBe(false);
    expect(deletesIntoHidden('left', [selection(3, 2, 2, 1)], visible)).toBe(false);
  });
});
