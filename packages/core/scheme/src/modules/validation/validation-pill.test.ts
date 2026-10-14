import { describe, expect, it } from 'vitest';
import { orderIssueSites, pickNextIssueIcon } from './validation-pill.js';

describe('validation pill stepping', () => {
  it('orders errors first, then top to bottom', () => {
    const ordered = orderIssueSites([
      { iconId: 'w', x: 0, y: 10, hasError: false },
      { iconId: 'b', x: 0, y: 300, hasError: true },
      { iconId: 'a', x: 0, y: 100, hasError: true },
    ]);
    expect(ordered).toEqual(['a', 'b', 'w']);
  });

  it('cycles and restarts when the current icon is gone', () => {
    const ordered = ['a', 'b'];
    expect(pickNextIssueIcon(ordered, null)).toBe('a');
    expect(pickNextIssueIcon(ordered, 'a')).toBe('b');
    expect(pickNextIssueIcon(ordered, 'b')).toBe('a');
    expect(pickNextIssueIcon(ordered, 'gone')).toBe('a');
    expect(pickNextIssueIcon([], 'a')).toBeNull();
  });
});
