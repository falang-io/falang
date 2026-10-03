import { describe, expect, it } from 'vitest';
import { expressionToTextValue, stringLiteralText, textValueToExpression } from './string-value-expression.js';

describe('expressionToTextValue', () => {
  it('reads quoted and template literals as their text', () => {
    expect(expressionToTextValue(`'hello'`)).toBe('hello');
    expect(expressionToTextValue(`"it's"`)).toBe("it's");
    expect(expressionToTextValue(String.raw`'line\nnext'`)).toBe('line\nnext');
    expect(expressionToTextValue('`Hi ${user.name}!`')).toBe('Hi ${user.name}!');
    expect(expressionToTextValue('`a \\` b`')).toBe('a ` b');
  });

  it('keeps an empty value empty and wraps any other expression in one interpolation', () => {
    expect(expressionToTextValue('  ')).toBe('');
    expect(expressionToTextValue('name')).toBe('${name}');
    expect(expressionToTextValue(`'a' + b`)).toBe(`\${'a' + b}`);
    expect(expressionToTextValue('`a` + `b`')).toBe('${`a` + `b`}');
  });
});

describe('textValueToExpression', () => {
  it('stores text without interpolations as a single-quoted literal', () => {
    expect(textValueToExpression('hello')).toBe(`'hello'`);
    expect(textValueToExpression("it's")).toBe(String.raw`'it\'s'`);
    expect(textValueToExpression('a\\b\nc')).toBe(String.raw`'a\\b\nc'`);
    expect(textValueToExpression('')).toBe(`''`);
  });

  it('stores text with interpolations as a template literal, interpolations verbatim', () => {
    expect(textValueToExpression('Hi ${user.name}!')).toBe('`Hi ${user.name}!`');
    expect(textValueToExpression('a ` b ${x.join("`")}')).toBe('`a \\` b ${x.join("`")}`');
  });

  it('round-trips', () => {
    for (const text of [
      'hello',
      "it's",
      String.raw`a\b`,
      'Hi ${name}',
      ['x ` y ', '${a}', String.raw` \ z`].join(''),
      'multi\nline ${b}',
    ]) {
      expect(expressionToTextValue(textValueToExpression(text))).toBe(text);
    }
  });
});

describe('stringLiteralText', () => {
  it('is the text of a whole string/template literal and null for anything else', () => {
    expect(stringLiteralText(`'a'`)).toBe('a');
    expect(stringLiteralText('`a ${b}`')).toBe('a ${b}');
    expect(stringLiteralText('name')).toBeNull();
    expect(stringLiteralText(`'a' + 'b'`)).toBeNull();
  });
});
