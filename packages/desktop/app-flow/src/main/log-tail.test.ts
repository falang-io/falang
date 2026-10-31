import { describe, expect, it } from 'vitest';
import { LogTail } from './log-tail.js';

describe('LogTail', () => {
  it('keeps only the last lines', () => {
    const tail = new LogTail(3);
    tail.push('a\nb\n');
    tail.push('c\r\nd\n\n');
    expect(tail.text()).toBe('b\nc\nd');
  });
});
