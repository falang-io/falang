import { describe, expect, it } from 'vitest';
import { TABLE_DISPATCHABLE_SOURCES, TABLE_ERROR_CODES, summarizeTable } from './table-rest.js';

describe('table wire contract', () => {
  it('dispatches only workflow, agent and mcp changes', () => {
    expect([...TABLE_DISPATCHABLE_SOURCES].toSorted()).toEqual(['agent', 'mcp', 'workflow']);
  });

  it('has unique error codes including the planned ones', () => {
    expect(new Set(TABLE_ERROR_CODES).size).toBe(TABLE_ERROR_CODES.length);
    for (const code of [
      'table_record_limit',
      'table_field_limit',
      'table_limit',
      'table_record_too_large',
      'where_required',
      'unknown_field',
      'required_field',
      'field_removed',
      'record_not_found',
      'validation',
    ]) {
      expect(TABLE_ERROR_CODES).toContain(code);
    }
  });

  it('summarizes a table', () => {
    expect(summarizeTable('id1', 'Clients', { fields: [], nextFieldNo: 1 })).toEqual({
      id: 'id1',
      name: 'Clients',
      fields: [],
      nextFieldNo: 1,
    });
  });
});
