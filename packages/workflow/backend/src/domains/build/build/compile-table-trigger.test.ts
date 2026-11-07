import type { IProjectDocument } from '@falang/dto';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// Real ts.Program type-check — see compile-project-documents.test.ts.
vi.setConfig({ testTimeout: 180_000 });

const TABLE_ID = '11111111-1111-4111-8111-111111111111';

const tableDocument: IProjectDocument = {
  id: TABLE_ID,
  type: 'table',
  name: 'Clients',
  data: {
    fields: [
      { id: 'f1', name: 'Name', type: 'text' },
      { id: 'f2', name: 'Phone', type: 'text' },
    ],
    nextFieldNo: 3,
  },
};

const triggerDocument = (triggerName: string, body: string): IProjectDocument => ({
  id: `doc-${triggerName}`,
  type: 'trigger-function',
  name: triggerName === 'table-record-created' ? 'onClientCreated' : 'onClientUpdated',
  root: {
    id: `tf-${triggerName}`,
    name: 'trigger-function',
    children: [
      { id: `h-${triggerName}`, name: 'function-header', data: '' },
      {
        id: `b-${triggerName}`,
        name: 'trigger-function-body',
        data: { vendor: 'tables', triggerName, credentialId: '', triggerConfig: { table: TABLE_ID } },
        children: [{ id: `l-${triggerName}`, name: 'log', data: body }],
      },
      { id: `f-${triggerName}`, name: 'function-footer', data: '' },
    ],
  },
});

describe('compiled table record triggers (ADR 0075 amendment A1)', () => {
  it('renames the id-keyed wire payload to names with a baked map and type-checks', () => {
    const result = compileProjectDocuments(
      [
        tableDocument,
        triggerDocument('table-record-created', 'new client ${event.record.Name} (${event.source})'),
        triggerDocument('table-record-updated', '${event.changedFields?.join(",")} ${event.previous?.Phone}'),
      ],
      REGISTERED_INTEGRATIONS,
    );
    expect(result.workflows).toContain('function __falangTableEvent(wire: __FalangTableWire): any {');
    expect(result.workflows).toContain(
      `const __falangTableFieldIds: Record<string, Record<string, string>> = {"${TABLE_ID}":{"Name":"f1","Phone":"f2"}};`,
    );
    expect(result.workflows).toContain("defineSignal<[__FalangTableWire]>('tableRecordCreated')");
    expect(result.workflows).toContain('event = __falangTableEvent(payload);');
    expect(result.workflows).toContain('A hand-typed test payload');
    // The runtime is emitted exactly once.
    expect(result.workflows.match(/function __falangTableEvent/g)).toHaveLength(1);
  });

  it('emits nothing for a project without table triggers', () => {
    const result = compileProjectDocuments([tableDocument], REGISTERED_INTEGRATIONS);
    expect(result.workflows).not.toContain('__falangTableEvent');
  });
});
