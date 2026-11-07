// oxlint-disable no-undefined -- absent cell values.
import type { ITableField } from '@falang/workflow-dto';
import { describe, expect, it } from 'vitest';
import { csvCellToValue, formatCsvRow, parseCsv, valueToCsvCell } from './table-csv.js';

const field = (type: ITableField['type']): ITableField => ({ id: 'f1', name: 'X', type });

describe('parseCsv', () => {
  it('parses plain rows, CRLF, a BOM and drops blank lines', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n\r\n3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles quotes, escaped quotes, commas and newlines inside cells', () => {
    expect(parseCsv('"a,1","he said ""hi""","line1\nline2"\n')).toEqual([['a,1', 'he said "hi"', 'line1\nline2']]);
  });

  it('keeps empty cells and a trailing row without a newline', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });
});

describe('formatCsvRow', () => {
  it('quotes only what needs it and round-trips through parseCsv', () => {
    const cells = ['plain', 'a,b', 'say "x"', 'two\nlines', ' padded ', ''];
    const line = formatCsvRow(cells);
    expect(line).toBe('plain,"a,b","say ""x""","two\nlines"," padded ",');
    expect(parseCsv(`${line}\n`)).toEqual([cells]);
  });
});

describe('cell conversion', () => {
  it('formats stored values: file id, json text, booleans, empty', () => {
    expect(valueToCsvCell(field('file'), { id: 'abc', name: 'a.txt', size: 1, mime: 'text/plain' })).toBe('abc');
    expect(valueToCsvCell(field('json'), { a: [1] })).toBe('{"a":[1]}');
    expect(valueToCsvCell(field('boolean'), false)).toBe('false');
    expect(valueToCsvCell(field('number'), null)).toBe('');
  });

  it('parses cells per field type', () => {
    expect(csvCellToValue(field('number'), ' 4.5 ')).toEqual({ ok: true, value: 4.5 });
    expect(csvCellToValue(field('number'), 'abc').ok).toBe(false);
    expect(csvCellToValue(field('boolean'), 'Yes')).toEqual({ ok: true, value: true });
    expect(csvCellToValue(field('boolean'), '0')).toEqual({ ok: true, value: false });
    expect(csvCellToValue(field('boolean'), 'maybe').ok).toBe(false);
    expect(csvCellToValue(field('json'), '{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(csvCellToValue(field('json'), '{oops').ok).toBe(false);
    expect(csvCellToValue(field('file'), 'abc').ok).toBe(false);
    expect(csvCellToValue(field('text'), '  keep  ')).toEqual({ ok: true, value: '  keep  ' });
    expect(csvCellToValue(field('date'), '2026-01-02')).toEqual({ ok: true, value: '2026-01-02' });
    expect(csvCellToValue(field('text'), '')).toEqual({ ok: true, value: null });
  });
});
