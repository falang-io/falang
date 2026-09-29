import { describe, expect, it } from 'vitest';
import { escapeForTemplateStringDisplay } from './escape-for-template-string-display.js';

describe('escapeForTemplateStringDisplay', () => {
  it('escapes a literal backslash and backtick so the preview matches how they will actually compile', () => {
    // oxlint-disable-next-line no-template-curly-in-string
    expect(escapeForTemplateStringDisplay('back\\slash and `tick`')).toBe('back\\\\slash and \\`tick\\`');
  });

  it('leaves a backslash escape sequence typed inside ${...} untouched, instead of doubling it', () => {
    // oxlint-disable-next-line no-template-curly-in-string
    const value = "joined: ${lines.join('\\n')}";
    expect(escapeForTemplateStringDisplay(value)).toBe(value);
  });

  it('still escapes literal text surrounding an interpolation', () => {
    // oxlint-disable-next-line no-template-curly-in-string
    const value = "back\\slash then ${lines.join('\\n')} and `tick`";
    expect(escapeForTemplateStringDisplay(value)).toBe(
      // oxlint-disable-next-line no-template-curly-in-string
      "back\\\\slash then ${lines.join('\\n')} and \\`tick\\`",
    );
  });

  it('returns an empty string for null', () => {
    expect(escapeForTemplateStringDisplay(null)).toBe('');
  });
});
