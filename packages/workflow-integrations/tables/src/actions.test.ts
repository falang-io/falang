// oxlint-disable no-undefined -- optional values are modelled with `undefined` throughout (absent filter/field).
import { describe, expect, it } from 'vitest';
import { tablesActions, TABLES_SHARED_ACTIVITY_CODE } from './actions.js';

const byName = (name: string) => {
  const action = tablesActions.find((candidate) => candidate.name === name);
  if (!action) throw new Error(`no action ${name}`);
  return action;
};

describe('tables actions', () => {
  it('start with a document-ref `table` field pointing at table documents', () => {
    for (const action of tablesActions) {
      expect(action.fields[0]).toMatchObject({ name: 'table', kind: 'document-ref', documentType: 'table' });
      expect(action.activityOptions).toEqual({ kind: 'regular', startToCloseTimeout: '30 seconds' });
      expect(action.activitySignature.startsWith(action.activityCode.split(' ')[2])).toBe(true);
    }
  });

  it('emits select with quoted table id and defaults', () => {
    expect(
      byName('table-select').emit({
        table: '"t1"',
        where: '{ name: "Ann" }',
        orderBy: '"name asc"',
        limit: '"100"',
        offset: '"0"',
        resultVariable: 'rows',
      }),
    ).toBe('const rows = await tableSelect("t1", { name: "Ann" }, "name asc", "100", "0");');
    expect(
      byName('table-select').emit({
        table: '"t1"',
        where: '',
        orderBy: '""',
        limit: '""',
        offset: '""',
        resultVariable: '',
      }),
    ).toBe('await tableSelect("t1", undefined, "", "", "");');
  });

  it('emits get, insert, update, delete', () => {
    expect(byName('table-get').emit({ table: '"t"', id: 'x', resultVariable: 'r' })).toBe(
      'const r = await tableGet("t", x);',
    );
    expect(byName('table-insert').emit({ table: '"t"', row: '{ a: 1 }', resultVariable: 'r' })).toBe(
      'const r = await tableInsert("t", { a: 1 });',
    );
    expect(
      byName('table-update').emit({ table: '"t"', set: '{ a: 1 }', where: '{ id: x }', resultVariable: 'n' }),
    ).toBe('const n = await tableUpdate("t", { a: 1 }, { id: x });');
    expect(byName('table-delete').emit({ table: '"t"', where: '{ id: x }', resultVariable: '' })).toBe(
      'await tableDelete("t", { id: x });',
    );
  });

  it('types where/row/set/result by the chosen table id and result shapes', () => {
    const select = byName('table-select');
    const where = select.fields[1];
    const expected = typeof where.expectedType === 'function' ? where.expectedType({ table: 'abc' }) : undefined;
    expect(expected).toEqual({ type: 'struct', id: 'table:abc#where' });
    expect(typeof where.expectedType === 'function' && where.expectedType({ table: '' })).toBeUndefined();
    const resultType = select.resultType as (fields: Record<string, string>) => unknown;
    expect(resultType({ table: 'abc' })).toEqual({
      type: 'array',
      elementType: { type: 'struct', id: 'table:abc' },
      dimensions: 1,
    });
    const insertExpected = byName('table-insert').fields[1].expectedType as (f: Record<string, string>) => unknown;
    expect(insertExpected({ table: 'abc' })).toEqual({ type: 'struct', id: 'table:abc#insert' });
    const patchExpected = byName('table-update').fields[1].expectedType as (f: Record<string, string>) => unknown;
    expect(patchExpected({ table: 'abc' })).toEqual({ type: 'struct', id: 'table:abc#patch' });
    expect(byName('table-update').resultType).toMatchObject({ type: 'number' });
  });

  it('requires a non-blank where for update and delete only', () => {
    for (const name of ['table-update', 'table-delete']) {
      const where = byName(name).fields.find((field) => field.name === 'where');
      expect(where?.validate?.('  ')).toBeTruthy();
      expect(where?.validate?.('{ a: 1 }')).toBeUndefined();
    }
    expect(byName('table-select').fields.find((field) => field.name === 'where')?.validate).toBeUndefined();
  });

  it('shared code uses the baked map and the byte-identical Context import', () => {
    expect(TABLES_SHARED_ACTIVITY_CODE).toContain("import { Context } from '@temporalio/activity';");
    expect(TABLES_SHARED_ACTIVITY_CODE).toContain('__falangTableFields[tableId]');
    expect(TABLES_SHARED_ACTIVITY_CODE).toContain('does not exist in this build');
  });
});
