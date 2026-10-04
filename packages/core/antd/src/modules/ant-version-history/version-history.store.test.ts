import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { ICommitInfo, IProjectSnapshot, IVersionStore, TCommitKind } from '@falang/versioning';
import { VersionHistoryStore } from './version-history.store.js';

let nextId = 0;
const generateId = (): string => {
  nextId += 1;
  return `commit-${nextId}`;
};

const buildNode = (id: string, name = 'action'): INode => ({ id, name });

const emptySnapshot: IProjectSnapshot = { folders: [], documents: [] };

const isEqualSnapshot = (a: IProjectSnapshot, b: IProjectSnapshot): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A minimal in-memory `IVersionStore` for the tests below — no HTTP/IPC, no git; a `Map` of commits plus one mutable "working copy" pointer. */
class FakeVersionStore implements IVersionStore {
  workingCopy: IProjectSnapshot = emptySnapshot;
  extraChanges = false;
  private readonly commits: ICommitInfo[] = [];
  private readonly snapshots = new Map<string, IProjectSnapshot>();

  listCommits(): Promise<ICommitInfo[]> {
    return Promise.resolve(this.commits.toReversed());
  }

  getSnapshot(commitId: string): Promise<IProjectSnapshot> {
    const snapshot = this.snapshots.get(commitId);
    if (!snapshot) throw new Error(`No snapshot for commit ${commitId}`);
    return Promise.resolve(snapshot);
  }

  hasExtraChanges(): Promise<boolean> {
    return Promise.resolve(this.extraChanges);
  }

  getWorkingCopy(): Promise<IProjectSnapshot> {
    return Promise.resolve(this.workingCopy);
  }

  commit(params: { kind: TCommitKind; message: string }): Promise<ICommitInfo | null> {
    const head = this.commits.at(-1);
    const headSnapshot = head ? (this.snapshots.get(head.id) ?? emptySnapshot) : emptySnapshot;
    if (isEqualSnapshot(headSnapshot, this.workingCopy)) return Promise.resolve(null);
    const id = generateId();
    const info: ICommitInfo = {
      id,
      parentId: head?.id ?? null,
      kind: params.kind,
      message: params.message,
      author: 'test',
      createdAt: new Date().toISOString(),
    };
    this.commits.push(info);
    this.snapshots.set(id, this.workingCopy);
    return Promise.resolve(info);
  }

  nameCommit(commitId: string, message: string): Promise<ICommitInfo> {
    const index = this.commits.findIndex((commit) => commit.id === commitId);
    if (index === -1) throw new Error(`No commit ${commitId}`);
    const updated: ICommitInfo = { ...this.commits[index], kind: 'named', message };
    this.commits[index] = updated;
    return Promise.resolve(updated);
  }

  async restore(commitId: string): Promise<ICommitInfo> {
    const snapshot = this.snapshots.get(commitId);
    if (!snapshot) throw new Error(`No snapshot for commit ${commitId}`);
    this.workingCopy = snapshot;
    const result = await this.commit({ kind: 'named', message: `Restore ${commitId}` });
    if (!result) throw new Error('Expected restore to always produce a commit');
    return result;
  }
}

describe('VersionHistoryStore', () => {
  it('commitNamed names HEAD instead of creating a new commit when nothing changed', async () => {
    const fakeStore = new FakeVersionStore();
    fakeStore.workingCopy = {
      folders: [],
      documents: [
        { id: 'doc-1', type: 'function', name: 'greet', folderId: null, pinned: false, root: buildNode('n1') },
      ],
    };
    const store = new VersionHistoryStore({ store: fakeStore });
    await store.refresh();

    const firstCommit = await store.commitNamed('Initial');
    expect(firstCommit?.kind).toBe('named');
    expect(store.commits).toHaveLength(1);

    // Working copy unchanged since the commit above — naming again should re-name HEAD, not create
    // a second commit.
    const secondNamed = await store.commitNamed('Renamed initial');
    expect(secondNamed?.id).toBe(firstCommit?.id);
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0].message).toBe('Renamed initial');
  });

  it('computes dirty from the diff between HEAD and the working copy', async () => {
    const fakeStore = new FakeVersionStore();
    fakeStore.workingCopy = {
      folders: [],
      documents: [
        { id: 'doc-1', type: 'function', name: 'greet', folderId: null, pinned: false, root: buildNode('n1') },
      ],
    };
    const store = new VersionHistoryStore({ store: fakeStore });
    await store.refresh();
    // No commit yet, working copy non-empty.
    expect(store.dirty).toBe(true);

    await store.commitNamed('Initial');
    expect(store.dirty).toBe(false);

    fakeStore.workingCopy = {
      folders: [],
      documents: [
        { id: 'doc-1', type: 'function', name: 'greet', folderId: null, pinned: false, root: buildNode('n1', 'if') },
      ],
    };
    await store.refresh();
    expect(store.dirty).toBe(true);
  });

  it('is dirty when only changes outside the document snapshot exist', async () => {
    const fakeStore = new FakeVersionStore();
    const store = new VersionHistoryStore({ store: fakeStore });
    await store.refresh();
    expect(store.dirty).toBe(false);
    fakeStore.extraChanges = true;
    await store.refresh();
    expect(store.dirty).toBe(true);
  });

  it('showAuto filters auto commits out of visibleCommits but always keeps the latest one', async () => {
    const fakeStore = new FakeVersionStore();
    const store = new VersionHistoryStore({ store: fakeStore });

    fakeStore.workingCopy = {
      folders: [],
      documents: [{ id: 'd1', type: 'function', name: 'a', folderId: null, pinned: false, root: buildNode('n1') }],
    };
    await store.refresh();
    await store.commitNamed('Named checkpoint');

    fakeStore.workingCopy = {
      folders: [],
      documents: [{ id: 'd1', type: 'function', name: 'a', folderId: null, pinned: false, root: buildNode('n2') }],
    };
    await store.refresh();
    await fakeStore.commit({ kind: 'auto', message: 'Auto-save 1' });
    await store.refresh();

    fakeStore.workingCopy = {
      folders: [],
      documents: [{ id: 'd1', type: 'function', name: 'a', folderId: null, pinned: false, root: buildNode('n3') }],
    };
    await store.refresh();
    await fakeStore.commit({ kind: 'auto', message: 'Auto-save 2' });
    await store.refresh();

    expect(store.commits).toHaveLength(3);
    expect(store.showAuto).toBe(false);
    // Named checkpoint always shows; the middle auto commit is hidden; the latest (also auto) shows
    // regardless, so HEAD is never hidden behind the toggle.
    expect(store.visibleCommits.map((c) => c.id)).toEqual([store.commits[0].id, store.commits[2].id]);

    store.setShowAuto(true);
    expect(store.visibleCommits).toHaveLength(3);
  });

  it('restore reloads the working copy and calls onRestored', async () => {
    const fakeStore = new FakeVersionStore();
    let restoredCount = 0;
    const store = new VersionHistoryStore({ store: fakeStore, onRestored: () => (restoredCount += 1) });

    fakeStore.workingCopy = {
      folders: [],
      documents: [{ id: 'd1', type: 'function', name: 'a', folderId: null, pinned: false, root: buildNode('n1') }],
    };
    await store.refresh();
    const first = await store.commitNamed('First');

    fakeStore.workingCopy = {
      folders: [],
      documents: [{ id: 'd1', type: 'function', name: 'a', folderId: null, pinned: false, root: buildNode('n2') }],
    };
    await store.refresh();
    await store.commitNamed('Second');

    expect(first).not.toBeNull();
    await store.restore((first as ICommitInfo).id);

    expect(restoredCount).toBe(1);
    expect(fakeStore.workingCopy.documents[0].root).toEqual(buildNode('n1'));
    // Restore auto-creates a new named commit on top — history keeps growing, never rewritten.
    expect(store.commits).toHaveLength(3);
  });

  it('compareHeadWithWorkingCopy sets a comparison once a HEAD exists', async () => {
    const fakeStore = new FakeVersionStore();
    const store = new VersionHistoryStore({ store: fakeStore });
    fakeStore.workingCopy = {
      folders: [],
      documents: [{ id: 'd1', type: 'function', name: 'a', folderId: null, pinned: false, root: buildNode('n1') }],
    };

    await store.refresh();
    // No commit yet — refresh() shouldn't have produced a comparison.
    expect(store.comparison).toBeNull();

    await store.commitNamed('First');
    fakeStore.workingCopy = {
      folders: [],
      documents: [{ id: 'd1', type: 'function', name: 'a', folderId: null, pinned: false, root: buildNode('n2') }],
    };
    await store.refresh();

    expect(store.comparison).not.toBeNull();
    expect(store.comparison?.left).toEqual(store.head);
    expect(store.comparison?.right).toBe('working-copy');
    expect(store.comparison?.diff.isEmpty).toBe(false);

    store.closeComparison();
    expect(store.comparison).toBeNull();
  });
});
