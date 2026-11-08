import { describe, expect, it } from 'vitest';
import { matchesStructSearch } from './struct-type-select.cmp.js';

describe('matchesStructSearch', () => {
  const option = { value: 'telegram/Message', label: 'Message' };

  it('matches a substring of the name or the id, case-insensitively', () => {
    expect(matchesStructSearch('ssa', option)).toBe(true);
    expect(matchesStructSearch('TELEGRAM', option)).toBe(true);
    expect(matchesStructSearch('gram/mes', option)).toBe(true);
    expect(matchesStructSearch('user', option)).toBe(false);
  });

  it('an empty input matches everything', () => {
    expect(matchesStructSearch('  ', option)).toBe(true);
  });
});
