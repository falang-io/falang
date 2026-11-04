import { describe, expect, it } from 'vitest';
import { isSingleUserMode } from './single-user-mode.js';

describe('isSingleUserMode', () => {
  it('is on only for SINGLE_USER_MODE=true', () => {
    expect(isSingleUserMode({ SINGLE_USER_MODE: 'true' })).toBe(true);
    expect(isSingleUserMode({ SINGLE_USER_MODE: ' TRUE ' })).toBe(true);
    expect(isSingleUserMode({ SINGLE_USER_MODE: 'false' })).toBe(false);
    expect(isSingleUserMode({ SINGLE_USER_MODE: '1' })).toBe(false);
    expect(isSingleUserMode({})).toBe(false);
  });
});
