import { describe, expect, it, vi } from 'vitest';
import { JsonFileToolProvider, type IAgentNodeKindFilter } from '@falang/agent';
import { emptyTableData, normalizeTableDocumentData, type ITableDocumentData } from '@falang/workflow-dto';
import type { WorkflowDocument } from '../workflow-types.js';
import { DocumentToolProvider } from './document-tool-provider.js';
import { createAgentDocumentResolver } from './create-agent-document-resolver.js';
import { buildTableFields, describeTableFields, parseTableFile } from './table-agent.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';
import { WorkflowJsonFilesHost } from './workflow-json-files-host.js';

const SECTIONS = [{ fixedKind: 'types', id: 'sec-types', name: 'Types', parentId: null }];

const fakeStore = (documents: WorkflowDocument[] = []) => {
  let counter = 0;
  const store = {
    createDocument: vi.fn((type: string, name: string, folderId: string | null) => {
      counter += 1;
      const id = `doc-${counter}`;
      documents.push({
        ...(type === 'table' ? { customData: emptyTableData() } : {}),
        folderId,
        id,
        name,
        type,
      } as never);
      return id;
    }),
    documents,
    folders: SECTIONS,
    getDocument: (id: string) => documents.find((doc) => doc.id === id),
    getTableData: (id: string): ITableDocumentData => {
      const parsed = normalizeTableDocumentData(null, documents.find((doc) => doc.id === id)?.customData);
      return parsed.ok ? parsed.data : emptyTableData();
    },
    typesRegistry: { types: new Map() },
    updateTableFields: vi.fn((id: string, data: ITableDocumentData) => {
      const doc = documents.find((item) => item.id === id);
      if (doc) doc.customData = data;
    }),
    vendorData: { byInstance: new Map() },
  };
  return { documents, store: store as unknown as IWorkflowAgentStore, raw: store };
};

const parse = (result: { ok: boolean; content?: string; error?: string }) => {
  if (!result.ok) throw new Error(`expected ok: ${result.error}`);
  return JSON.parse(result.content as string) as Record<string, unknown>;
};

describe('buildTableFields', () => {
  const previous: ITableDocumentData = {
    fields: [
      { id: 'f1', name: 'title', type: 'text' },
      { id: 'f3', name: 'qty', type: 'number' },
    ],
    nextFieldNo: 4,
  };

  it('keeps existing ids (also on rename) and gives new fields the next ids', () => {
    const result = buildTableFields(previous, [
      { id: 'f3', name: 'amount', type: 'number' },
      { name: 'note', type: 'text' },
      { name: 'done', type: 'boolean' },
    ]);
    expect(result.ok && result.data.fields.map((field) => `${field.id}:${field.name}`)).toEqual([
      'f3:amount',
      'f4:note',
      'f5:done',
    ]);
    expect(result.ok && result.data.nextFieldNo).toBe(6);
  });

  it('rejects unknown ids, reserved and duplicate names, bad types', () => {
    expect(buildTableFields(previous, [{ id: 'f9', name: 'x', type: 'text' }]).ok).toBe(false);
    expect(buildTableFields(previous, [{ name: 'version', type: 'text' }]).ok).toBe(false);
    expect(
      buildTableFields(previous, [
        { name: 'a', type: 'text' },
        { name: 'A', type: 'text' },
      ]).ok,
    ).toBe(false);
    expect(buildTableFields(previous, [{ name: 'a', type: 'money' }]).ok).toBe(false);
    expect(buildTableFields(previous, 'nope').ok).toBe(false);
  });

  it('describes required fields and defaults', () => {
    const built = buildTableFields(null, [
      { name: 'title', required: true, type: 'text' },
      { name: 'qty', type: 'number', required: true, defaultValue: 0 },
    ]);
    expect(built.ok && describeTableFields(built.data)).toBe('fields: title:text!, qty:number!=0');
  });

  it('parseTableFile ignores a written nextFieldNo and reports bad JSON', () => {
    const parsed = parseTableFile(
      previous,
      JSON.stringify({ fields: [{ id: 'f1', name: 'title', type: 'text' }], nextFieldNo: 1 }),
    );
    expect(parsed.ok && parsed.data.nextFieldNo).toBe(4);
    expect(parseTableFile(null, '{oops').ok).toBe(false);
  });
});

describe('DocumentToolProvider table tools', () => {
  it('create_table creates the document with ids, then set_table_fields replaces keeping ids', () => {
    const { raw, store } = fakeStore();
    const provider = new DocumentToolProvider(store);
    const created = parse(
      provider.execute({
        id: 'c',
        input: { fields: [{ name: 'title', required: true, type: 'text' }], name: 'orders' },
        name: 'create_table',
      }),
    );
    expect(created.documentId).toBe('doc-1');
    expect(raw.createDocument).toHaveBeenCalledWith('table', 'orders', null);
    expect(created.fields).toEqual([{ id: 'f1', name: 'title', required: true, type: 'text' }]);

    const updated = parse(
      provider.execute({
        id: 'c',
        input: {
          fields: [
            { id: 'f1', name: 'subject', required: true, type: 'text' },
            { name: 'qty', type: 'number' },
          ],
          name: 'orders',
        },
        name: 'set_table_fields',
      }),
    );
    expect((updated.fields as { id: string; name: string }[]).map((field) => `${field.id}:${field.name}`)).toEqual([
      'f1:subject',
      'f2:qty',
    ]);
  });

  it('refuses duplicate document names, invalid fields and unknown tables', () => {
    const { raw, store } = fakeStore([{ folderId: null, id: 'd1', name: 'Orders', type: 'function' }]);
    const provider = new DocumentToolProvider(store);
    const run = (name: string, input: unknown) => provider.execute({ id: 'c', input, name });
    expect(run('create_table', { fields: [], name: 'orders' }).ok).toBe(false);
    expect(run('create_table', { fields: [{ name: 'id', type: 'text' }], name: 'items' }).ok).toBe(false);
    expect(raw.createDocument).not.toHaveBeenCalled();
    expect(run('set_table_fields', { documentId: 'zzz', fields: [] }).ok).toBe(false);
  });
});

describe('WorkflowJsonFilesHost tables/<name>.json', () => {
  const build = (documents: WorkflowDocument[] = []) => {
    const fake = fakeStore(documents);
    const nodeKindFilter = { isListed: () => true } as unknown as IAgentNodeKindFilter;
    const host = new WorkflowJsonFilesHost({ nodeKindFilter, store: fake.store });
    const provider = new JsonFileToolProvider(host);
    const run = (name: string, input: Record<string, unknown>) => provider.execute({ id: 'c', input, name });
    return { ...fake, host, run };
  };

  it('creates a table by writing a new file, then updates it keeping ids; errors write nothing', async () => {
    const { raw, run } = build();
    const created = await run('write_file', {
      content: JSON.stringify({ fields: [{ name: 'title', type: 'text' }] }),
      path: 'tables/orders.json',
    });
    expect(parse(created).created).toBe(true);
    expect(raw.createDocument).toHaveBeenCalledWith('table', 'orders', null);

    const list = await run('list_files', {});
    expect(list.ok && list.content).toContain('tables/orders.json  (table, writable)');
    const read = await run('read_file', { path: 'tables/orders.json' });
    expect(read.ok && JSON.parse(read.content).fields[0].id).toBe('f1');

    const edited = await run('edit_file', {
      new_string: '"subject"',
      old_string: '"title"',
      path: 'tables/orders.json',
    });
    expect(parse(edited).fields).toEqual([{ id: 'f1', name: 'subject', type: 'text' }]);

    const calls = raw.updateTableFields.mock.calls.length;
    const bad = await run('write_file', {
      content: JSON.stringify({ fields: [{ name: 'x', type: 'nope' }] }),
      path: 'tables/orders.json',
    });
    expect(bad.ok).toBe(false);
    expect(raw.updateTableFields.mock.calls.length).toBe(calls);
  });

  it("rewrites an existing table with the session's beforeWrite wired (the node resolver refuses tables)", async () => {
    const fake = fakeStore();
    const resolver = createAgentDocumentResolver({
      acquireLock: vi.fn(),
      getDocument: fake.raw.getDocument,
      getScheme: () => {
        throw new Error('a table has no scheme');
      },
    });
    const nodeKindFilter = { isListed: () => true } as unknown as IAgentNodeKindFilter;
    const host = new WorkflowJsonFilesHost({
      beforeWrite: (id) => resolver.resolve(id),
      nodeKindFilter,
      store: fake.store,
    });
    const provider = new JsonFileToolProvider(host);
    const write = (fields: unknown[]) =>
      provider.execute({
        id: 'c',
        input: { content: JSON.stringify({ fields }), path: 'tables/games.json' },
        name: 'write_file',
      });

    expect(parse(await write([{ name: 'status', type: 'text' }])).created).toBe(true);
    const rewritten = await write([
      { id: 'f1', name: 'status', type: 'text' },
      { name: 'score', type: 'number' },
    ]);
    expect(parse(rewritten).fields).toEqual([
      { id: 'f1', name: 'status', type: 'text' },
      { id: 'f2', name: 'score', type: 'number' },
    ]);
  });

  it('rejects a name clashing with another document and non-json paths', async () => {
    const { run } = build([{ folderId: null, id: 'd1', name: 'orders', type: 'function' }]);
    const clash = await run('write_file', { content: '{"fields":[]}', path: 'tables/Orders.json' });
    expect(clash.ok).toBe(false);
    const nested = await run('write_file', { content: '{}', path: 'tables/sub/x.json' });
    expect(nested.ok).toBe(false);
  });

  it('maps a table-* node reference between document id and file path', () => {
    const { host } = build([{ customData: emptyTableData(), folderId: null, id: 't1', name: 'orders', type: 'table' }]);
    expect(host.dataMapping.out('table-select', { table: 't1' })).toEqual({ table: 'tables/orders.json' });
    expect(host.dataMapping.in('table-select', { table: 'tables/orders.json' })).toEqual({ table: 't1' });
    expect(host.dataMapping.in('table-select', { table: 'orders' })).toEqual({ table: 't1' });
  });

  it('documents tables in NODES.md', () => {
    const { host } = build();
    expect(host.extraFiles['NODES.md']?.()).toContain('# Tables');
  });
});
