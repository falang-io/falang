import { describe, expect, it } from 'vitest';
import { tableEventStructId } from './table-struct-ids.js';
import { tablesTriggers } from './triggers.js';

describe('tablesTriggers', () => {
  it('are signal triggers over a table document-ref with the payload transform', () => {
    expect(tablesTriggers.map((trigger) => trigger.signalName)).toEqual([
      'tableRecordCreated',
      'tableRecordUpdated',
      'tableRecordDeleted',
    ]);
    for (const trigger of tablesTriggers) {
      expect(trigger.delivery).toBe('signal');
      expect(trigger.transformPayload).toEqual({ kind: 'tables' });
      expect(trigger.scopeVariableName).toBe('event');
      expect(trigger.contextFields).toEqual([
        { name: 'table', label: 'tables:field.table', kind: 'document-ref', documentType: 'table' },
      ]);
      expect(trigger.notes).toContain('NEVER fire');
      expect(trigger.notes).toContain('event.source');
      expect(trigger.journalMessage).toContain('${event.record.id}');
    }
  });

  it('types the payload by the chosen table', () => {
    const [created] = tablesTriggers;
    expect(created.scopeTypeFor?.({ table: 'abc' })).toEqual({ type: 'struct', id: tableEventStructId('abc') });
  });
});
