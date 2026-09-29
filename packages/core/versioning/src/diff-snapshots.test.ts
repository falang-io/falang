import type { INode } from '@falang/dto';
import { assert, describe, it } from 'vitest';
import { diffSnapshots, isSnapshotDirty } from './diff-snapshots.js';
import type { IProjectSnapshot, ISnapshotDocument } from './snapshot.js';

const mkNode = (id: string, name = 'stmt'): INode => ({ id, name });

const doc = (overrides: Partial<ISnapshotDocument> & { id: string }): ISnapshotDocument => ({
  type: 'function',
  name: overrides.id,
  folderId: null,
  pinned: false,
  ...overrides,
});

const snapshot = (overrides: Partial<IProjectSnapshot> = {}): IProjectSnapshot => ({
  folders: [],
  documents: [],
  ...overrides,
});

describe('diffSnapshots', () => {
  it('reports a document rename as modified', () => {
    const a = snapshot({ documents: [doc({ id: 'd1', name: 'Old name', root: mkNode('d1') })] });
    const b = snapshot({ documents: [doc({ id: 'd1', name: 'New name', root: mkNode('d1') })] });

    const diff = diffSnapshots(a, b);

    assert.equal(diff.documents.length, 1);
    const [change] = diff.documents;
    assert.equal(change.kind, 'modified');
    assert.deepEqual(change.renamed, { from: 'Old name', to: 'New name' });
    assert.isFalse(diff.isEmpty);
  });

  it('reports a folder move between parents', () => {
    const a = snapshot({ folders: [{ id: 'f1', name: 'Folder', parentId: null }] });
    const b = snapshot({ folders: [{ id: 'f1', name: 'Folder', parentId: 'root-folder' }] });

    const diff = diffSnapshots(a, b);

    assert.equal(diff.folders.length, 1);
    assert.deepEqual(diff.folders[0], {
      folderId: 'f1',
      name: 'Folder',
      kind: 'moved',
      movedTo: { from: null, to: 'root-folder' },
    });
    assert.isFalse(diff.isEmpty);
  });

  it('reports a combined rename + move folder change as one renamed entry with both fields', () => {
    const a = snapshot({ folders: [{ id: 'f1', name: 'Old', parentId: null }] });
    const b = snapshot({ folders: [{ id: 'f1', name: 'New', parentId: 'p1' }] });

    const diff = diffSnapshots(a, b);

    assert.equal(diff.folders[0].kind, 'renamed');
    assert.deepEqual(diff.folders[0].renamed, { from: 'Old', to: 'New' });
    assert.deepEqual(diff.folders[0].movedTo, { from: null, to: 'p1' });
  });

  it('diffs a custom (data-only, no root) document like integrations, field-path prefixed', () => {
    const a = snapshot({
      documents: [doc({ id: 'integrations', type: 'custom', data: { instances: [{ id: 'i1', kind: 'openai' }] } })],
    });
    const b = snapshot({
      documents: [doc({ id: 'integrations', type: 'custom', data: { instances: [{ id: 'i1', kind: 'telegram' }] } })],
    });

    const diff = diffSnapshots(a, b);

    const [change] = diff.documents;
    assert.equal(change.kind, 'modified');
    assert.isUndefined(change.tree);
    assert.deepEqual(change.dataFields, [
      {
        path: 'data.instances',
        oldValue: [{ id: 'i1', kind: 'openai' }],
        newValue: [{ id: 'i1', kind: 'telegram' }],
      },
    ]);
  });

  it('marks an unchanged custom document as unchanged with no dataFields', () => {
    const a = snapshot({ documents: [doc({ id: 'integrations', type: 'custom', data: { a: 1 } })] });
    const b = snapshot({ documents: [doc({ id: 'integrations', type: 'custom', data: { a: 1 } })] });

    const diff = diffSnapshots(a, b);

    assert.equal(diff.documents[0].kind, 'unchanged');
    assert.isUndefined(diff.documents[0].dataFields);
    assert.isTrue(diff.isEmpty);
  });

  it('reports added and removed documents', () => {
    const a = snapshot({ documents: [doc({ id: 'd1', root: mkNode('d1') })] });
    const b = snapshot({
      documents: [doc({ id: 'd1', root: mkNode('d1') }), doc({ id: 'd2', root: mkNode('d2') })],
    });

    const diff = diffSnapshots(a, b);

    const added = diff.documents.find((change) => change.documentId === 'd2');
    assert.equal(added?.kind, 'added');

    const removedDiff = diffSnapshots(b, a);
    const removed = removedDiff.documents.find((change) => change.documentId === 'd2');
    assert.equal(removed?.kind, 'removed');
  });

  it('is empty for two identical snapshots', () => {
    const s = snapshot({
      folders: [{ id: 'f1', name: 'Folder', parentId: null }],
      documents: [doc({ id: 'd1', root: mkNode('d1') })],
    });

    const diff = diffSnapshots(s, structuredClone(s));

    assert.isTrue(diff.isEmpty);
    assert.deepEqual(diff.folders, []);
    assert.isTrue(diff.documents.every((change) => change.kind === 'unchanged'));
  });
});

describe('isSnapshotDirty', () => {
  it('is true when there is no head commit and the working copy has any document', () => {
    const workingCopy = snapshot({ documents: [doc({ id: 'd1', root: mkNode('d1') })] });
    assert.isTrue(isSnapshotDirty(null, workingCopy));
  });

  it('is true when there is no head commit and the working copy has any folder', () => {
    const workingCopy = snapshot({ folders: [{ id: 'f1', name: 'Folder', parentId: null }] });
    assert.isTrue(isSnapshotDirty(null, workingCopy));
  });

  it('is false when there is no head commit and the working copy is empty', () => {
    assert.isFalse(isSnapshotDirty(null, snapshot()));
  });

  it('delegates to diffSnapshots when a head commit exists', () => {
    const head = snapshot({ documents: [doc({ id: 'd1', root: mkNode('d1') })] });
    const workingCopy = snapshot({ documents: [doc({ id: 'd1', name: 'Renamed', root: mkNode('d1') })] });

    assert.isTrue(isSnapshotDirty(head, workingCopy));
    assert.isFalse(isSnapshotDirty(head, structuredClone(head)));
  });
});
