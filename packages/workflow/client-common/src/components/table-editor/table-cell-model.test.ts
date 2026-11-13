import { describe, expect, it } from 'vitest';
import type { ITableField } from '@falang/workflow-dto';
import {
  buildCellPatch,
  buildInsertData,
  formatCell,
  missingRequiredFields,
  parseCellInput,
  parseJsonCellText,
} from './table-cell-model.js';

const f = (type: ITableField['type'], extra: Partial<ITableField> = {}): ITableField => ({
  id: 'f1',
  name: 'x',
  type,
  ...extra,
});

describe('table cell model', () => {
  it('formats cells by type', () => {
    expect(formatCell(f('boolean'), true)).toBe('✓');
    expect(formatCell(f('json'), { a: 1 })).toBe('{"a":1}');
    expect(formatCell(f('file'), { id: 'i', name: 'a.png', size: 1, mime: 'image/png' })).toBe('a.png');
    expect(formatCell(f('text'), null)).toBe('');
    expect(formatCell(f('number'), 3)).toBe('3');
  });

  it('parses and clears values', () => {
    expect(parseCellInput(f('number'), 4)).toEqual({ ok: true, value: 4 });
    expect(parseCellInput(f('number'), '')).toEqual({ ok: true, value: null });
    expect(parseCellInput(f('number'), 'abc').ok).toBe(false);
    expect(parseCellInput(f('select', { options: ['a'] }), 'b').ok).toBe(false);
    expect(parseCellInput(f('date'), '2026-02-30').ok).toBe(false);
  });

  it('parses JSON text', () => {
    expect(parseJsonCellText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonCellText('  ')).toEqual({ ok: true, value: null });
    expect(parseJsonCellText('{').ok).toBe(false);
  });

  it('builds patches and insert data', () => {
    expect(buildCellPatch(f('text'), null)).toEqual({ f1: null });
    expect(buildInsertData({ f1: 'a', f2: '', f3: null, f4: 0 })).toEqual({ f1: 'a', f4: 0 });
    expect(missingRequiredFields([f('text', { required: true })], {}).length).toBe(1);
    expect(missingRequiredFields([f('text', { required: true, defaultValue: 'x' })], {})).toEqual([]);
    expect(missingRequiredFields([f('boolean', { required: true, defaultValue: false })], {})).toEqual([]);
  });
});
