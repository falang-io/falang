// oxlint-disable no-undefined -- an unset env var is `undefined`.
import { describe, expect, it } from 'vitest';
import { parseScheduleCatchupWindow } from './schedule-guard.js';

describe('parseScheduleCatchupWindow', () => {
  it('defaults to 60 seconds for unset, junk and non-positive values', () => {
    for (const raw of [undefined, '', 'abc', '0', '-5', '1.5']) {
      expect(parseScheduleCatchupWindow(raw)).toBe('60 seconds');
    }
  });
  it('reads whole seconds', () => {
    expect(parseScheduleCatchupWindow('300')).toBe('300 seconds');
  });
});
