import { describe, expect, it } from 'vitest';
import { needsLargeBody } from '../../http-hardening/body-limits.js';

describe('tables routes and the large-body list', () => {
  it('allows the large limit on CSV import and cell upload only', () => {
    const id = '00000000-0000-4000-8000-0000000000a1';
    expect(needsLargeBody(`/projects/p1/tables/${id}/import.csv`)).toBe(true);
    expect(needsLargeBody(`/projects/p1/tables/${id}/files`)).toBe(true);
    expect(needsLargeBody(`/projects/p1/tables/${id}/records`)).toBe(false);
  });
});
