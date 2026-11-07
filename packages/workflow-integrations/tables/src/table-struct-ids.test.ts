import { describe, expect, it } from 'vitest';
import {
  parseTableStructId,
  tableEventStructId,
  tableInsertStructId,
  tablePatchStructId,
  tableRowStructId,
  tableWhereStructId,
} from './table-struct-ids.js';

const ID = '123e4567-e89b-42d3-a456-426614174000';

describe('table struct ids', () => {
  it('builds ids from the document id', () => {
    expect(tableRowStructId(ID)).toBe(`table:${ID}`);
    expect(tableInsertStructId(ID)).toBe(`table:${ID}#insert`);
    expect(tablePatchStructId(ID)).toBe(`table:${ID}#patch`);
    expect(tableWhereStructId(ID)).toBe(`table:${ID}#where`);
    expect(tableEventStructId(ID)).toBe(`table:${ID}#event`);
  });

  it('parses them back', () => {
    expect(parseTableStructId(tableRowStructId(ID))).toEqual({ docId: ID });
    for (const variant of ['insert', 'patch', 'where', 'event'] as const) {
      expect(parseTableStructId(`table:${ID}#${variant}`)).toEqual({ docId: ID, variant });
    }
  });

  it('rejects foreign ids', () => {
    expect(parseTableStructId('db:abc:users')).toBeUndefined();
    expect(parseTableStructId('files/File')).toBeUndefined();
    expect(parseTableStructId(`table:${ID}#other`)).toBeUndefined();
    expect(parseTableStructId('table:')).toBeUndefined();
    expect(parseTableStructId(`xtable:${ID}`)).toBeUndefined();
  });
});
