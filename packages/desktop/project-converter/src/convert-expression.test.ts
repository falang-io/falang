import { describe, expect, it } from 'vitest';
import { convertExpression } from './convert-expression.js';

describe('convertExpression', () => {
  it('returns empty/whitespace-only input unchanged', () => {
    expect(convertExpression('')).toBe('');
    expect(convertExpression('   ')).toBe('   ');
  });

  it('maps "and"/"or" to "&&"/"||", preserving surrounding formatting exactly', () => {
    expect(convertExpression('state.snake.dirX == 0 and state.snake.dirY == 0')).toBe(
      'state.snake.dirX == 0 && state.snake.dirY == 0',
    );
    expect(convertExpression('a or b')).toBe('a || b');
    expect(convertExpression('a and b or c')).toBe('a && b || c');
  });

  it('does not reformat text that already needs no translation — even irregular spacing', () => {
    // Real example from the "snake" fixture's hand-verified golden conversion: no space before
    // "nextPoint.x" is carried over byte for byte, not normalized to "= nextPoint.x".
    expect(convertExpression('state.snake.x =nextPoint.x')).toBe('state.snake.x =nextPoint.x');
    expect(convertExpression('4 * pointsInside / pointsTotal')).toBe('4 * pointsInside / pointsTotal');
  });

  it('maps "not" to "!", preserving the original space after the old keyword operator (valid, if unusual, TypeScript)', () => {
    expect(convertExpression('not a')).toBe('! a');
    expect(convertExpression('not(a)')).toBe('!(a)');
  });

  it('maps "mod" to "%"', () => {
    expect(convertExpression('a mod b')).toBe('a % b');
  });

  it('maps "a ^ b" to "Math.pow(a, b)", respecting precedence over lower-precedence operators', () => {
    expect(convertExpression('r ^ 2')).toBe('Math.pow(r, 2)');
    expect(convertExpression('x ^ 2 + y ^ 2')).toBe('Math.pow(x, 2) + Math.pow(y, 2)');
    expect(convertExpression('2 ^ -2')).toBe('Math.pow(2, -2)');
  });

  it('maps "a xor b" to a boolean-coerced strict-inequality expression', () => {
    expect(convertExpression('a xor b')).toBe('(!!(a) !== !!(b))');
  });

  it('maps a bare call to an old whitelisted expression function to Math.<fn>(...)', () => {
    expect(convertExpression('random()')).toBe('Math.random()');
    expect(convertExpression('sin(x)')).toBe('Math.sin(x)');
    expect(convertExpression('y = random() * r * 2 - r')).toBe('y = Math.random() * r * 2 - r');
  });

  it('does not rewrite a call to a same-named function through member access', () => {
    expect(convertExpression('obj.sin(x)')).toBe('obj.sin(x)');
  });

  it('keeps "==" and "!=" unchanged', () => {
    expect(convertExpression('a == b')).toBe('a == b');
    expect(convertExpression('a != b')).toBe('a != b');
  });

  it('passes through member access, indexing, literals, arrays, objects, ternaries and assignment unchanged', () => {
    expect(convertExpression('state.snake.body')).toBe('state.snake.body');
    expect(convertExpression('arr[0]')).toBe('arr[0]');
    expect(convertExpression('42')).toBe('42');
    expect(convertExpression("'hello'")).toBe("'hello'");
    expect(convertExpression('[a, b, c]')).toBe('[a, b, c]');
    expect(convertExpression('{ x: 1, y: 2 }')).toBe('{ x: 1, y: 2 }');
    expect(convertExpression('a ? b : c')).toBe('a ? b : c');
    expect(convertExpression('state.snake.x = nextPoint.x')).toBe('state.snake.x = nextPoint.x');
  });

  it('translates a keyword operator nested inside an otherwise-untouched expression, leaving the rest verbatim', () => {
    expect(convertExpression('foo(a and b, c)')).toBe('foo(a && b, c)');
    expect(convertExpression('[a and b, c]')).toBe('[a && b, c]');
    expect(convertExpression('(a and b).x')).toBe('(a && b).x');
  });

  it('does not mistake an "and"/"or"/"mod" identifier substring, or a same-named property, for the keyword operator', () => {
    expect(convertExpression('android')).toBe('android');
    expect(convertExpression('obj.and')).toBe('obj.and');
    expect(convertExpression('moduleCount')).toBe('moduleCount');
  });

  it('returns an unparseable expression unchanged rather than throwing', () => {
    expect(convertExpression('a + ')).toBe('a + ');
    expect(convertExpression('a random b')).toBe('a random b');
  });

  it('does not translate an old expression function reference used without a call', () => {
    // Old app data can never actually contain this (the old generator throws on any function name
    // outside its whitelist, and a bare, uncalled `sin` isn't a FunctionNode at all) — this just
    // confirms the identifier-vs-call distinction, not a real-world case.
    expect(convertExpression('sin + 1')).toBe('sin + 1');
  });
});
