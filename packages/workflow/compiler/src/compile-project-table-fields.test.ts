import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileActivities } from './compile-activities.js';
import { compileProject } from './compile-project.js';
import { collectTableFields } from './table-fields.js';

const tableData = (fields: { id: string; name: string }[]) => ({
  fields: fields.map((field) => ({ ...field, type: 'text' })),
  nextFieldNo: fields.length + 1,
});

const tableDocument = (id: string, fields: { id: string; name: string }[]): IProjectDocument => ({
  id,
  type: 'table',
  name: `T ${id}`,
  data: tableData(fields),
});

const callNode = (name: string): INode => ({ id: 'n1', name, data: {} });

const functionDocument = (bodyChildren: INode[]): IProjectDocument => ({
  id: 'fn1',
  type: 'function',
  name: 'main',
  root: {
    id: 'fn',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      { id: 'b', name: 'function-body', data: { parameters: [] }, children: bodyChildren },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  },
});

const tablesVendor: IWorkflowIntegration = {
  vendor: 'tables',
  label: 'Tables',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  sharedActivityCode: 'const useTables = () => __falangTableFields;',
  actions: [
    {
      name: 'table-delete',
      label: 'delete',
      fields: [],
      emit: () => 'await tableDelete();',
      activityCode: 'export const tableDelete = async () => useTables();',
      activitySignature: 'tableDelete(): Promise<void>',
    },
  ],
};

describe('table field maps in the activities module', () => {
  it('collects every table document, name -> id', () => {
    expect(
      collectTableFields([
        tableDocument('t1', [{ id: 'f1', name: 'Имя' }]),
        tableDocument('t2', []),
        functionDocument([]),
      ]),
    ).toEqual({ t1: { Имя: 'f1' }, t2: {} });
  });

  it('exports __falangTableFields when the tables vendor is used, with quotes and Cyrillic intact', () => {
    const name = 'it"s \\ {x}\' `y`';
    const project = compileProject({
      documents: [
        functionDocument([callNode('table-delete')]),
        tableDocument('t1', [
          { id: 'f1', name },
          { id: 'f2', name: 'Телефон' },
        ]),
      ],
      integrations: [tablesVendor],
    });
    const line = project.activities
      .split('\n')
      .find((candidate) => candidate.startsWith('export const __falangTableFields'));
    if (!line) throw new Error('__falangTableFields export missing');
    const json = line.slice(line.indexOf('= ') + 2, -1);
    expect(JSON.parse(json)).toEqual({ t1: { [name]: 'f1', Телефон: 'f2' } });
  });

  it('does not export it for a project that does not use the tables vendor', () => {
    const project = compileProject({
      documents: [functionDocument([]), tableDocument('t1', [{ id: 'f1', name: 'a' }])],
      integrations: [tablesVendor],
    });
    expect(project.activities).not.toContain('__falangTableFields');
  });

  it('emits an empty map when a block mentions the export but no map was given', () => {
    const result = compileActivities([tablesVendor.sharedActivityCode ?? '']);
    expect(result).toContain('export const __falangTableFields: Record<string, Record<string, string>> = {};');
  });
});
