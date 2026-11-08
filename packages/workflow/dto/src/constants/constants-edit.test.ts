import { describe, expect, it } from 'vitest';
import type { IWorkflowConstant } from './constants-document.js';
import { applyConstantChanges, describeConstantsForTool, parseConstantChanges } from './constants-edit.js';

const API_URL: IWorkflowConstant = { id: 'c1', name: 'API_URL', type: 'string', dev: 'd', prod: 'p' };
const LIMIT: IWorkflowConstant = { id: 'c2', name: 'LIMIT', type: 'number', dev: 1, prod: 2 };

const ids = () => {
  let next = 0;
  return () => {
    next += 1;
    return `new-${next}`;
  };
};

describe('parseConstantChanges', () => {
  it('reads upserts and deletions, keeping only the keys that were given', () => {
    expect(
      parseConstantChanges({
        set: [
          { name: 'A', type: 'boolean', dev: true },
          { name: 'B', newName: 'C' },
        ],
        delete: ['X'],
      }),
    ).toEqual({
      ok: true,
      changes: {
        set: [
          { name: 'A', type: 'boolean', dev: true },
          { name: 'B', newName: 'C' },
        ],
        delete: ['X'],
      },
    });
  });

  it('lists malformed entries', () => {
    expect(parseConstantChanges({ set: [{}, { name: 'A', type: 'date' }], delete: [1] })).toEqual({
      ok: false,
      errors: [
        'set[0]: needs a "name"',
        'set[1] (A): "type" must be one of string, number, boolean',
        '"delete" must be a list of names',
      ],
    });
    expect(parseConstantChanges('x').ok).toBe(false);
  });
});

describe('applyConstantChanges', () => {
  it('creates with defaults, updates in place keeping the id, renames and deletes', () => {
    const result = applyConstantChanges(
      [API_URL, LIMIT],
      {
        set: [
          { name: 'LIMIT', prod: 20 },
          { name: 'API_URL', newName: 'SITE_URL' },
          { name: 'DEBUG', type: 'boolean', dev: true },
        ],
        delete: [],
      },
      ids(),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        constants: [
          { id: 'c1', name: 'SITE_URL', type: 'string', dev: 'd', prod: 'p' },
          { id: 'c2', name: 'LIMIT', type: 'number', dev: 1, prod: 20 },
          { id: 'new-1', name: 'DEBUG', type: 'boolean', dev: true, prod: false },
        ],
      },
    });
    expect(applyConstantChanges([API_URL, LIMIT], { delete: ['API_URL'] }, ids())).toEqual({
      ok: true,
      data: { constants: [LIMIT] },
    });
  });

  it('converts the kept values when only the type changes', () => {
    const result = applyConstantChanges([LIMIT], { set: [{ name: 'LIMIT', type: 'string' }] }, ids());
    expect(result).toEqual({ ok: true, data: { constants: [{ ...LIMIT, type: 'string', dev: '1', prod: '2' }] } });
  });

  it('applies nothing when any change is invalid', () => {
    const result = applyConstantChanges(
      [API_URL],
      { set: [{ name: 'NEW' }, { name: 'bad', type: 'string' }, { name: 'API_URL', dev: 5 }], delete: ['GONE'] },
      ids(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      'delete: no constant named "GONE"',
      'set (NEW): a new constant needs a "type" (string, number, boolean)',
    ]);
    const typed = applyConstantChanges([API_URL], { set: [{ name: 'API_URL', dev: 5 }] }, ids());
    expect(typed).toEqual({ ok: false, errors: ['constants[0] (API_URL): the dev value must be a string'] });
    const named = applyConstantChanges([], { set: [{ name: 'bad', type: 'string' }] }, ids());
    expect(named.ok).toBe(false);
  });

  it('shows constants without ids', () => {
    expect(describeConstantsForTool([API_URL])).toEqual([{ name: 'API_URL', type: 'string', dev: 'd', prod: 'p' }]);
  });
});
