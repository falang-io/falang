import { NodesGroup, NodesStack } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { describeNodeKind } from './node-kinds.js';
import { TABLES_VENDOR_NODE_KIND_NOTES } from './node-kind-notes-tables.js';

describe('tables node kind notes', () => {
  it('cover the five actions', () => {
    expect(Object.keys(TABLES_VENDOR_NODE_KIND_NOTES).toSorted()).toEqual([
      'table-delete',
      'table-get',
      'table-insert',
      'table-select',
      'table-update',
    ]);
  });

  it('explain the filter, the mandatory where, optimistic locking and snapshot results', () => {
    expect(TABLES_VENDOR_NODE_KIND_NOTES['table-select']).toContain('SNAPSHOT');
    expect(TABLES_VENDOR_NODE_KIND_NOTES['table-select']).toContain('gte');
    for (const name of ['table-update', 'table-delete']) {
      expect(TABLES_VENDOR_NODE_KIND_NOTES[name]).toContain('REQUIRED');
      expect(TABLES_VENDOR_NODE_KIND_NOTES[name]).toContain('{ id, version }');
    }
  });

  it('is picked up by describeNodeKind', () => {
    const stack = new NodesStack([new NodesGroup([{ name: 'table-update' }])]);
    expect(describeNodeKind('table-update', stack).notes).toContain('non-empty');
  });
});
