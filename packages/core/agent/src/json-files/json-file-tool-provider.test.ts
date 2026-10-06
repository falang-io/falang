import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryModule, schemeFactory, type Scheme } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { JsonFileToolProvider, type IJsonFilesHost } from './json-file-tool-provider.js';

describe('JsonFileToolProvider', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let provider: JsonFileToolProvider;
  const writes: string[] = [];

  beforeEach(() => {
    scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), id: 'd1', root: { ...getTestEmptyDoc().root, id: 'root' }, type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule()],
    });
    writes.length = 0;
    const host: IJsonFilesHost = {
      beforeWrite: (id) => writes.push(id),
      extraFiles: { 'NODES.md': () => '# kinds' },
      getScheme: () => scheme,
      listDocuments: () => [{ id: 'd1', name: 'main', path: 'functions/main.json', type: 'function' }],
      readKindSchema: (kind) => (kind === 'action' ? '{"type":"string"}' : null),
    };
    provider = new JsonFileToolProvider(host);
  });

  const call = (name: string, input: Record<string, unknown>) => provider.execute({ id: 'c', input, name });

  it('offers no check_project when the host cannot compile', () => {
    expect(provider.tools.map((tool) => tool.name)).toEqual(['list_files', 'read_file', 'write_file', 'edit_file']);
  });

  it('lists documents and references, reads them, and refuses unknown paths', async () => {
    const list = await call('list_files', {});
    expect(list.ok && list.content).toContain('functions/main.json  (function, writable)');
    expect(await call('read_file', { path: 'NODES.md' })).toEqual({ content: '# kinds', ok: true });
    expect(await call('read_file', { path: 'schemas/action.json' })).toEqual({
      content: '{"type":"string"}',
      ok: true,
    });
    const missing = await call('read_file', { path: 'schemas/nope.json' });
    expect(missing.ok).toBe(false);
    const other = await call('read_file', { path: 'functions/other.json' });
    expect(other.ok).toBe(false);
  });

  it('applies edit_file through the write pipeline and reports the changes', async () => {
    const result = await call('edit_file', {
      new_string: '"children": [{ "name": "action", "data": "go()" }]',
      old_string: '"children": []',
      path: 'functions/main.json',
    });
    expect(result.ok).toBe(true);
    expect(result.ok && JSON.parse(result.content)).toMatchObject({ changed: { added: 1 }, ok: true });
    expect(scheme.nodes.getNode('2').children.map((child) => child.data)).toEqual(['go()']);
    expect(writes).toEqual(['d1']);
  });

  it('refuses an edit_file whose old_string is missing or ambiguous, and writes to read-only files', async () => {
    const missing = await call('edit_file', { new_string: 'x', old_string: 'not there', path: 'functions/main.json' });
    expect(!missing.ok && missing.error).toContain('read_file it again');
    const ambiguous = await call('edit_file', {
      new_string: '"data": "x"',
      old_string: '"data": ""',
      path: 'functions/main.json',
    });
    expect(!ambiguous.ok && ambiguous.error).toContain('occurs 3 times');
    const readOnly = await call('write_file', { content: '{}', path: 'NODES.md' });
    expect(readOnly.ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it('does not create a document when the host has no createDocument', async () => {
    const result = await call('write_file', { content: '{}', path: 'functions/new.json' });
    expect(!result.ok && result.error).toContain("can't be created");
  });
});
