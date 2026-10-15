// oxlint-disable max-lines, require-await, no-promise-executor-return, no-await-expression-member, no-non-null-assertion, no-empty-function, no-undefined, consistent-type-imports, no-var-requires, prefer-module, prefer-event-target, consistent-function-scoping, init-declarations, no-useless-undefined -- test scaffolding: fake electron/BrowserWindow stand-ins, timer waits and loose fixtures read better with these stylistic rules off
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDocument,
  createProject,
  readLastEditedAt,
  writeDocument,
  writeLastEditedAt,
} from '@falang/desktop-project-fs';
import { getVersionStore, withAutoVersion } from './versioning.js';
import { setVersioningSettings } from './settings.js';

let userDataDir = '';
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }));

const HOUR = 60 * 60 * 1000;

const docWithName = (id: string, name: string) => ({ id, type: 'function', name, root: undefined });

describe('main/versioning withAutoVersion (ADR 0025 (private), session-gap rule)', () => {
  let projectDir = '';

  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-ver-userdata-'));
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-ver-project-'));
    await createProject(projectDir, { name: 'P', type: 'arduino' });
    await createDocument(projectDir, { document: docWithName('d1', 'before-edit'), folderId: null });
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('getVersionStore caches one instance per directory', () => {
    expect(getVersionStore(projectDir)).toBe(getVersionStore(projectDir));
    expect(getVersionStore(projectDir)).not.toBe(getVersionStore(`${projectDir}-other`));
  });

  it('first write in a project (no recorded edit) auto-commits the PRE-edit state, then records the edit', async () => {
    await withAutoVersion(projectDir, () => writeDocument(projectDir, docWithName('d1', 'after-edit')));
    const commits = await getVersionStore(projectDir).listCommits();
    expect(commits).toHaveLength(1);
    expect(commits[0]?.kind).toBe('auto');
    const snapshot = await getVersionStore(projectDir).getSnapshot(commits[0]!.id);
    expect(JSON.stringify(snapshot)).toContain('before-edit');
    expect(JSON.stringify(snapshot)).not.toContain('after-edit');
    expect(await readLastEditedAt(projectDir)).not.toBeNull();
  });

  it('a write within the gap creates no commit', async () => {
    await writeLastEditedAt(projectDir, new Date(Date.now() - HOUR));
    await withAutoVersion(projectDir, () => writeDocument(projectDir, docWithName('d1', 'x')));
    expect(await getVersionStore(projectDir).listCommits()).toHaveLength(0);
  });

  it('a write after a gap longer than the default (3h) commits the pre-edit state', async () => {
    await writeLastEditedAt(projectDir, new Date(Date.now() - 4 * HOUR));
    await withAutoVersion(projectDir, () => writeDocument(projectDir, docWithName('d1', 'after-edit')));
    const commits = await getVersionStore(projectDir).listCommits();
    expect(commits).toHaveLength(1);
    expect(JSON.stringify(await getVersionStore(projectDir).getSnapshot(commits[0]!.id))).toContain('before-edit');
  });

  it('honours autoVersionGapHours from the settings', async () => {
    await setVersioningSettings({
      repoMode: 'private',
      author: { name: 'T', email: 't@example.com' },
      autoVersionGapHours: 1,
    });
    await writeLastEditedAt(projectDir, new Date(Date.now() - 2 * HOUR));
    await withAutoVersion(projectDir, () => writeDocument(projectDir, docWithName('d1', 'x')));
    expect(await getVersionStore(projectDir).listCommits()).toHaveLength(1);
  });

  it('a failing auto-version does not block the write itself', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = getVersionStore(projectDir);
    vi.spyOn(store, 'commit').mockRejectedValue(new Error('git exploded'));
    const write = vi.fn(async () => 'written');
    await expect(withAutoVersion(projectDir, write)).resolves.toBe('written');
    expect(write).toHaveBeenCalledOnce();
    // The edit is still recorded after the write.
    expect(await readLastEditedAt(projectDir)).not.toBeNull();
    errorSpy.mockRestore();
  });

  it('markEdited happens after the write, not before it', async () => {
    let seenDuringWrite: Date | null | undefined;
    await withAutoVersion(projectDir, async () => {
      seenDuringWrite = await readLastEditedAt(projectDir);
    });
    expect(seenDuringWrite).toBeNull();
    expect(await readLastEditedAt(projectDir)).not.toBeNull();
  });

  it('a failing write propagates and does not record the edit', async () => {
    await expect(
      withAutoVersion(projectDir, async () => {
        throw new Error('disk full');
      }),
    ).rejects.toThrow('disk full');
    expect(await readLastEditedAt(projectDir)).toBeNull();
  });
});
