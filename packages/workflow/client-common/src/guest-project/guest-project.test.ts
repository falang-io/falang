import { describe, expect, it } from 'vitest';
import type { IApiProjectExport } from '../api-types.js';
import { GuestProjectDataPort } from './guest-project-data-port.js';
import { buildGuestProjectState, guestProjectToExport, type IGuestProjectState } from './guest-project.js';

const counterIds = (): (() => string) => {
  let next = 0;
  return () => {
    next += 1;
    return `new-${next}`;
  };
};

/** A script-uploaded template: no section folders, no integrations document. */
const bareTemplate: IApiProjectExport = {
  formatVersion: 1,
  project: { id: '', name: 'Bot' },
  folders: [],
  documents: [
    { id: 'trigger-1', type: 'trigger-function', name: 'onMessage', folderId: null, pinned: false, root: null },
    {
      id: 'fn-1',
      type: 'function',
      name: 'helper',
      folderId: null,
      pinned: false,
      root: { id: 'fn-1', name: 'function' },
    },
  ],
};

describe('buildGuestProjectState', () => {
  it('adds the fixed sections and an empty integrations document to a bare template', () => {
    const state = buildGuestProjectState(bareTemplate, counterIds());
    expect(state.folders.map((folder) => folder.fixedKind).toSorted()).toEqual([
      'functions',
      'tables',
      'triggers',
      'types',
    ]);
    const sectionOf = (kind: string) => state.folders.find((folder) => folder.fixedKind === kind)?.id;
    expect(state.documents.find((doc) => doc.id === 'trigger-1')?.folderId).toBe(sectionOf('triggers'));
    expect(state.documents.find((doc) => doc.id === 'fn-1')).toMatchObject({
      folderId: sectionOf('functions'),
      root: { id: 'fn-1', name: 'function' },
      pinned: false,
    });
    expect(state.documents[0]).toMatchObject({
      type: 'integrations',
      name: 'Integrations',
      pinned: true,
      folderId: null,
      data: { instances: [] },
    });
  });

  it("keeps an exported template's sections, folders and integrations document", () => {
    const exported: IApiProjectExport = {
      formatVersion: 1,
      project: { id: '', name: 'Exported' },
      folders: [
        { id: 'sec-t', name: 'Triggers', parentId: null, fixedKind: 'triggers' },
        { id: 'sec-f', name: 'Functions', parentId: null, fixedKind: 'functions' },
        { id: 'sec-y', name: 'Types', parentId: null, fixedKind: 'types' },
        { id: 'sec-tb', name: 'Tables', parentId: null, fixedKind: 'tables' },
        { id: 'user', name: 'Bots', parentId: 'sec-t', fixedKind: null },
      ],
      documents: [
        {
          id: 'int',
          type: 'integrations',
          name: 'Integrations',
          folderId: null,
          pinned: true,
          data: { instances: [{ id: 'c' }] },
        },
        { id: 'trigger-1', type: 'trigger-function', name: 'onMessage', folderId: 'user', pinned: false, root: null },
      ],
    };
    const state = buildGuestProjectState(exported, counterIds());
    expect(state.folders.map((folder) => folder.id).toSorted()).toEqual(
      ['sec-f', 'sec-tb', 'sec-t', 'sec-y', 'user'].toSorted(),
    );
    expect(state.documents).toEqual([
      expect.objectContaining({ id: 'int', pinned: true, data: { instances: [{ id: 'c' }] } }),
      expect.objectContaining({ id: 'trigger-1', folderId: 'user' }),
    ]);
  });

  it('round-trips into the export format the import route takes', () => {
    const state = buildGuestProjectState(bareTemplate, counterIds());
    const payload = guestProjectToExport(state, 'My bot');
    expect(payload.project).toEqual({ id: '', name: 'My bot' });
    expect(payload.folders.every((folder) => typeof folder.fixedKind === 'string')).toBe(true);
    expect(buildGuestProjectState(payload, counterIds())).toEqual(state);
  });
});

describe('GuestProjectDataPort', () => {
  const setUp = () => {
    const changes: IGuestProjectState[] = [];
    const port = new GuestProjectDataPort(buildGuestProjectState(bareTemplate, counterIds()), (next) =>
      changes.push(next),
    );
    return { port, changes };
  };

  it('serves the tree and the documents without touching anything', async () => {
    const { port, changes } = setUp();
    const tree = await port.getTree();
    expect(tree.documents.map((doc) => doc.id)).toEqual([expect.any(String), 'trigger-1', 'fn-1']);
    const documents = await port.getDocuments();
    expect(documents.find((doc) => doc.id === 'fn-1')?.root).toEqual({ id: 'fn-1', name: 'function' });
    expect(documents.find((doc) => doc.id === 'trigger-1')).not.toHaveProperty('root');
    expect(documents[0]?.data).toEqual({ instances: [] });
    expect(changes).toHaveLength(0);
  });

  it('applies every write and reports the new state', async () => {
    const { port, changes } = setUp();
    const tree = await port.getTree();
    const functions = tree.folders.find((folder) => folder.fixedKind === 'functions')?.id ?? null;
    await port.createFolder({ id: 'sub', name: 'Utils', parentId: functions });
    await port.createDocument({ id: 'fn-2', type: 'function', name: 'other', folderId: 'sub' });
    await port.updateDocument('fn-1', { name: 'renamed', root: { id: 'fn-1', name: 'function', children: [] } });
    await port.updateDocument('fn-2', { folderId: functions });
    await port.updateFolder('sub', { name: 'Helpers' });
    expect(changes).toHaveLength(5);
    const last = changes.at(-1) as IGuestProjectState;
    expect(last.documents.find((doc) => doc.id === 'fn-1')).toMatchObject({ name: 'renamed', root: { children: [] } });
    expect(last.documents.find((doc) => doc.id === 'fn-2')?.folderId).toBe(functions);
    expect(last.folders.find((folder) => folder.id === 'sub')?.name).toBe('Helpers');

    await port.updateDocument('fn-2', { folderId: 'sub' });
    await port.deleteFolder('sub');
    await port.deleteDocument('trigger-1');
    const final = port.snapshot();
    expect(final.folders.some((folder) => folder.id === 'sub')).toBe(false);
    expect(final.documents.map((doc) => doc.id)).toEqual([expect.any(String), 'fn-1']);
    await expect(port.updateDocument('missing', { name: 'x' })).rejects.toThrow();
  });

  it('copies what it is given and what it reports', async () => {
    const { port, changes } = setUp();
    const root = { id: 'fn-1', name: 'function', children: [] };
    await port.updateDocument('fn-1', { root });
    root.children.push({ id: 'x', name: 'action' } as never);
    expect(port.snapshot().documents.find((doc) => doc.id === 'fn-1')?.root?.children).toEqual([]);
    changes[0]?.documents.pop();
    expect(port.snapshot().documents).toHaveLength(3);
  });
});
