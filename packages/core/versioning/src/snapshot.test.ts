import { assert, describe, it } from 'vitest';
import { snapshotFromExportPayload } from './snapshot.js';

describe('snapshotFromExportPayload', () => {
  it('picks folders and documents, dropping any other export-payload fields', () => {
    const payload = {
      project: { id: 'p1', name: 'My project' },
      formatVersion: 3,
      folders: [{ id: 'f1', name: 'Folder', parentId: null }],
      documents: [{ id: 'd1', type: 'function', name: 'Doc', folderId: null, pinned: false }],
    };

    const snapshot = snapshotFromExportPayload(payload);

    assert.deepEqual(snapshot, {
      folders: [{ id: 'f1', name: 'Folder', parentId: null }],
      documents: [{ id: 'd1', type: 'function', name: 'Doc', folderId: null, pinned: false }],
    });
  });
});
