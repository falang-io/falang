import { describe, expect, it } from 'vitest';
import { lowerIncrementStatement } from './increment-statement.js';

describe('lowerIncrementStatement', () => {
  it('turns a whole-statement increment or decrement into a plain assignment', () => {
    expect(lowerIncrementStatement('x++')).toBe('x = x + 1');
    expect(lowerIncrementStatement('x--')).toBe('x = x - 1');
    expect(lowerIncrementStatement('++x')).toBe('x = x + 1');
    expect(lowerIncrementStatement('--x')).toBe('x = x - 1');
    expect(lowerIncrementStatement('a[i].count++')).toBe('a[i].count = a[i].count + 1');
  });

  it('turns a compound assignment into a plain assignment', () => {
    expect(lowerIncrementStatement('x += 2')).toBe('x = x + (2)');
    expect(lowerIncrementStatement('x -= y + 1')).toBe('x = x - (y + 1)');
    expect(lowerIncrementStatement('x *= k')).toBe('x = x * (k)');
    expect(lowerIncrementStatement('x /= 2')).toBe('x = x / (2)');
    expect(lowerIncrementStatement('x %= 3')).toBe('x = x % (3)');
  });

  it('leaves everything else alone', () => {
    expect(lowerIncrementStatement('x = x - 1')).toBe('x = x - 1');
    expect(lowerIncrementStatement('y = x++')).toBe('y = x++');
    expect(lowerIncrementStatement('-x')).toBe('-x');
    expect(lowerIncrementStatement('foo(x++)')).toBe('foo(x++)');
    expect(lowerIncrementStatement('x &&= y')).toBe('x &&= y');
  });
});
