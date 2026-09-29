import { describe, expect, it } from 'vitest';
import { buildSqlActions } from './build-sql-integration.js';
import type { IActionDescriptor } from '@falang/workflow-integrations-common';

const actions = buildSqlActions('sqlite', { vendor: 'sqlite', activityPrefix: 'sqlite' });
const findAction = (name: string): IActionDescriptor => {
  const action = actions.find((candidate) => candidate.name === name);
  if (!action) throw new Error(`expected action "${name}" to be registered`);
  return action;
};

describe('buildSqlActions', () => {
  it('registers the six structured-CRUD-plus-raw-SQL node kinds, named "<vendor>-<verb>"', () => {
    expect(actions.map((a) => a.name).toSorted()).toEqual(
      [
        'sqlite-select',
        'sqlite-select-one',
        'sqlite-insert',
        'sqlite-update',
        'sqlite-delete',
        'sqlite-query',
      ].toSorted(),
    );
  });

  it('every action has a non-empty activitySignature naming the shared-activity-code function', () => {
    for (const action of actions) {
      expect(action.activitySignature.startsWith('sqlite')).toBe(true);
      expect(action.activityOptions).toEqual({ kind: 'regular', startToCloseTimeout: '60 seconds' });
    }
  });

  describe('resultType', () => {
    it('*-select resolves Row[] once credentialId/table are chosen', () => {
      const resultTypeFn = findAction('sqlite-select').resultType;
      if (typeof resultTypeFn !== 'function') throw new Error('expected a function resultType');
      expect(resultTypeFn({ credentialId: 'inst1', table: 'orders' })).toEqual({
        type: 'array',
        elementType: { type: 'struct', id: 'db:inst1:orders' },
        dimensions: 1,
      });
    });

    it('*-select resolves nothing when table/credentialId are not chosen yet', () => {
      const resultTypeFn = findAction('sqlite-select').resultType;
      if (typeof resultTypeFn !== 'function') throw new Error('expected a function resultType');
      expect(resultTypeFn({})).toBeUndefined();
    });

    it('*-update/*-delete resolve a plain int32 number', () => {
      expect(findAction('sqlite-update').resultType).toEqual({
        type: 'number',
        numberType: { type: 'integer', integerType: 'int32' },
      });
      expect(findAction('sqlite-delete').resultType).toEqual({
        type: 'number',
        numberType: { type: 'integer', integerType: 'int32' },
      });
    });

    it('*-query defaults to any[] and otherwise parses the "result" field', () => {
      const resultType = findAction('sqlite-query').resultType;
      if (typeof resultType !== 'function') throw new Error('expected a function resultType');
      expect(resultType({})).toEqual({ type: 'array', elementType: { type: 'any' }, dimensions: 1 });
      expect(resultType({ result: JSON.stringify({ type: 'string' }) })).toEqual({ type: 'string' });
      expect(resultType({ result: 'not json' })).toEqual({
        type: 'array',
        elementType: { type: 'any' },
        dimensions: 1,
      });
    });
  });

  describe('emit', () => {
    it('emits an assignment when resultVariable is set, a bare call otherwise', () => {
      const del = findAction('sqlite-delete');
      expect(del.emit({ credentialId: '"c1"', table: '"orders"', where: '{ id: 1 }', resultVariable: '' })).toBe(
        'await sqliteDelete("c1", "orders", { id: 1 });',
      );
      expect(
        del.emit({ credentialId: '"c1"', table: '"orders"', where: '{ id: 1 }', resultVariable: 'affected' }),
      ).toBe('const affected = await sqliteDelete("c1", "orders", { id: 1 });');
    });

    it('falls back to a safe default for a blank expression field (where/row/set/params)', () => {
      const del = findAction('sqlite-delete');
      expect(del.emit({ credentialId: '"c1"', table: '"orders"', where: '', resultVariable: '' })).toBe(
        'await sqliteDelete("c1", "orders", undefined);',
      );

      const insert = findAction('sqlite-insert');
      expect(insert.emit({ credentialId: '"c1"', table: '"orders"', row: '', resultVariable: '' })).toBe(
        'await sqliteInsert("c1", "orders", {});',
      );

      const query = findAction('sqlite-query');
      expect(query.emit({ credentialId: '"c1"', sql: '"select 1"', params: '', result: '', resultVariable: '' })).toBe(
        'await sqliteQuery("c1", "select 1", []);',
      );
    });
  });
});
