import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '../documents.js';
import { createProject } from '../project.js';
import { createGitVersionStore } from './git-version-store.js';
import type { IGitVersioningOptions } from './git-version-store-types.js';
import { autoVersionBeforeEdit, markEdited, readLastEditedAt, writeLastEditedAt } from './session-gap-store.js';

const doc = (id: string, value: string): IProjectDocument => ({
  id,
  type: 'contour',
  name: id,
  root: { id: `${id}-root`, name: 'contour', data: { value } },
});

const makeOptions = (overrides: Partial<IGitVersioningOptions> = {}): IGitVersioningOptions => ({
  repoMode: 'private',
  author: { name: 'Test Author', email: 'test@example.com' },
  ...overrides,
});

describe('session-gap store (desktop)', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-session-gap-test-'));
    await createProject(projectDir, { name: 'My Project', type: 'text' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('readLastEditedAt is null before anything was ever recorded', async () => {
    await expect(readLastEditedAt(projectDir)).resolves.toBeNull();
  });

  it('writeLastEditedAt/readLastEditedAt round-trip through the sidecar file', async () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    await writeLastEditedAt(projectDir, now);
    await expect(readLastEditedAt(projectDir)).resolves.toEqual(now);
  });

  it('autoVersionBeforeEdit commits the pre-edit state on a gap (including "never recorded")', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const commit = await autoVersionBeforeEdit(projectDir, store);
    expect(commit).not.toBeNull();
    expect(commit?.kind).toBe('auto');

    const commits = await store.listCommits();
    expect(commits).toHaveLength(1);
  });

  it('autoVersionBeforeEdit is a no-op when there is no gap', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    await markEdited(projectDir);
    const commit = await autoVersionBeforeEdit(projectDir, store);
    expect(commit).toBeNull();
    await expect(store.listCommits()).resolves.toEqual([]);
  });

  it('autoVersionBeforeEdit is a no-op when the gap applies but the working copy is clean vs HEAD', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());
    await store.commit({ kind: 'named', message: 'End of session' });

    // Simulate a 4h-old last edit — well past the default gap.
    await writeLastEditedAt(projectDir, new Date(Date.now() - 4 * 60 * 60 * 1000));

    const commit = await autoVersionBeforeEdit(projectDir, store);
    expect(commit).toBeNull();
    await expect(store.listCommits()).resolves.toHaveLength(1);
  });

  it('a custom gapMs is honored', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());
    await markEdited(projectDir, new Date(Date.now() - 1000));

    await expect(autoVersionBeforeEdit(projectDir, store, new Date(), 500)).resolves.not.toBeNull();
  });
});
