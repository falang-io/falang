import { describe, expect, it } from 'vitest';
import { TablesRequestError, dataToIds, invertFieldMap, orderByToIds, recordToRow, whereToIds } from './translate.js';

const fields = { name: 'f1', phone: 'f2', 'it"s': 'f3' };

describe('whereToIds', () => {
  it('maps names, passes system keys and operator values through', () => {
    expect(whereToIds({ name: 'Ann', phone: { startsWith: '+7' }, id: 'x', version: 3 }, fields)).toEqual({
      f1: 'Ann',
      f2: { startsWith: '+7' },
      id: 'x',
      version: 3,
    });
  });

  it('recurses through nested and/or', () => {
    expect(whereToIds({ or: [{ name: 'a' }, { and: [{ phone: 'b' }, { version: 1 }] }] }, fields)).toEqual({
      or: [{ f1: 'a' }, { and: [{ f2: 'b' }, { version: 1 }] }],
    });
  });

  it('fails for a removed field with a non-retryable error', () => {
    expect(() => whereToIds({ email: 'x' }, fields)).toThrow('field "email" no longer exists');
    expect(() => whereToIds({ and: [{ email: 'x' }] }, fields)).toThrow(TablesRequestError);
  });

  it('treats blank filters as undefined and rejects non-objects', () => {
    expect(whereToIds(undefined, fields)).toBeUndefined();
    expect(() => whereToIds('x', fields)).toThrow('where must be an object');
    expect(() => whereToIds({ and: 1 }, fields)).toThrow('array');
  });

  it('does not treat prototype names as fields', () => {
    expect(() => whereToIds({ toString: 1 }, fields)).toThrow('no longer exists');
  });
});

describe('dataToIds', () => {
  it('maps names, drops undefined, keeps null', () => {
    expect(dataToIds({ name: 'A', phone: null, 'it"s': 1, x: undefined }, { ...fields, x: 'f9' })).toEqual({
      f1: 'A',
      f2: null,
      f3: 1,
    });
  });

  it('rejects unknown and system keys', () => {
    expect(() => dataToIds({ nope: 1 }, fields)).toThrow('field "nope" no longer exists');
    expect(() => dataToIds({ id: 'x' }, fields)).toThrow('field "id" no longer exists');
  });
});

describe('orderByToIds', () => {
  it('parses a comma list with optional direction and system keys', () => {
    expect(orderByToIds('name, createdAt DESC, phone asc', fields)).toEqual([
      { field: 'f1', dir: 'asc' },
      { field: 'createdAt', dir: 'desc' },
      { field: 'f2', dir: 'asc' },
    ]);
  });

  it('is undefined when blank and fails on garbage or removed fields', () => {
    expect(orderByToIds('  ', fields)).toBeUndefined();
    expect(() => orderByToIds('name sideways', fields)).toThrow('cannot read');
    expect(() => orderByToIds('zip', fields)).toThrow('field "zip" no longer exists');
  });
});

describe('recordToRow', () => {
  it('flattens to names, drops unknown ids and keeps system keys', () => {
    expect(
      recordToRow({ id: 'r1', version: 2, createdAt: 'c', updatedAt: 'u', data: { f1: 'Ann', f7: 'gone' } }, fields),
    ).toEqual({ name: 'Ann', id: 'r1', version: 2, createdAt: 'c', updatedAt: 'u' });
  });

  it('inverts the map', () => {
    expect(invertFieldMap(fields)).toEqual({ f1: 'name', f2: 'phone', f3: 'it"s' });
  });
});
