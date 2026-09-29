import { describe, expect, it } from 'vitest';
import { indentLines } from './indent.js';

describe('indentLines', () => {
  it('indents every line by one level (two spaces) by default', () => {
    expect(indentLines('a;\nb;')).toBe('  a;\n  b;');
  });

  it('indents by the requested number of levels', () => {
    expect(indentLines('a;', 2)).toBe('    a;');
  });

  it('leaves blank lines empty instead of adding trailing whitespace', () => {
    expect(indentLines('a;\n\nb;')).toBe('  a;\n\n  b;');
  });

  it('returns an empty string unchanged', () => {
    expect(indentLines('')).toBe('');
  });
});
