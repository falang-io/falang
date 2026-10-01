// oxlint-disable unicorn/consistent-function-scoping
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from './project.js';
import type { IProjectDocument } from '@falang/dto';
import { createDocument } from './documents.js';
import { createFolder } from './folders.js';
import { documentsDir, driversDir, manifestPath } from './paths.js';
import { watchProject, type IProjectChangeEvent, type IProjectWatcher } from './watch-project.js';

/**
 * Real `fs.watch` against a real temp dir — generous timeouts/polling rather than a fixed sleep,
 * since inotify delivery timing isn't guaranteed. If this suite ever proves flaky in CI, the
 * debounce/suppression logic itself (`scheduleFlush`/`markOwnWrite`'s window) is simple enough to
 * unit-test in isolation instead — noted here rather than done preemptively since a first pass
 * against this sandbox's real filesystem watcher came back stable.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitFor = async (predicate: () => boolean, timeoutMs = 5000, stepMs = 50): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    // oxlint-disable-next-line no-await-in-loop
    await sleep(stepMs);
  }
  if (!predicate()) throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
};

describe('watchProject', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;
  // oxlint-disable-next-line init-declarations
  let watcher: IProjectWatcher;
  // oxlint-disable-next-line init-declarations
  let events: IProjectChangeEvent[];

  const start = (): void => {
    events = [];
    watcher = watchProject(projectDir, (event) => events.push(event));
  };

  const makeDoc = (id: string): IProjectDocument => ({
    id,
    type: 'contour',
    name: id,
    root: { id: `${id}-root`, name: 'contour' },
  });

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-watch-test-'));
    await createProject(projectDir, { name: 'Watched', type: 'text' });
    events = [];
    watcher = watchProject(projectDir, () => null);
  });

  afterEach(async () => {
    watcher.stop();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('reports a document change with the changed id, debounced and coalesced', async () => {
    await createDocument(projectDir, { document: makeDoc('doc-1'), folderId: null });
    watcher.stop();
    start();
    const file = path.join(documentsDir(projectDir), 'doc-1.json');
    await fs.writeFile(file, JSON.stringify(makeDoc('doc-1')));
    await fs.writeFile(file, JSON.stringify({ ...makeDoc('doc-1'), name: 'doc-1' }));

    await waitFor(() => events.some((event) => event.kind === 'document'));

    const documentEvents = events.filter((event) => event.kind === 'document');
    // Two rapid writes to the same file inside the debounce window coalesce into one event.
    expect(documentEvents).toHaveLength(1);
    expect(documentEvents[0]?.documentIds).toEqual(['doc-1']);
  }, 10_000);

  it('maps a change in a nested folder file to the right document id', async () => {
    const outer = await createFolder(projectDir, { name: 'Game', parentId: null });
    const inner = await createFolder(projectDir, { name: 'Render', parentId: outer.id });
    await createDocument(projectDir, { document: { ...makeDoc('doc-n'), name: 'Draw food' }, folderId: inner.id });
    watcher.stop();
    start();

    const file = path.join(documentsDir(projectDir), 'Game', 'Render', 'Draw food.json');
    await fs.writeFile(file, JSON.stringify({ ...makeDoc('doc-n'), name: 'Draw food' }));

    await waitFor(() => events.some((event) => event.kind === 'document'));
    expect(events.find((event) => event.kind === 'document')?.documentIds).toEqual(['doc-n']);
  }, 10_000);

  it('suppresses a document event for a write markOwnWrite was just called for', async () => {
    await createDocument(projectDir, { document: makeDoc('doc-own'), folderId: null });
    watcher.stop();
    start();
    watcher.markOwnWrite('doc-own');
    await fs.writeFile(path.join(documentsDir(projectDir), 'doc-own.json'), JSON.stringify(makeDoc('doc-own')));

    // Give the watcher a full debounce window plus slack to prove no event arrives, rather than
    // asserting instantly (which would pass trivially before the debounce timer even fires).
    await sleep(600);
    expect(events.filter((event) => event.kind === 'document')).toEqual([]);
  }, 10_000);

  it('reports a manifest change when falang.json is rewritten', async () => {
    start();
    await fs.writeFile(
      manifestPath(projectDir),
      JSON.stringify({ name: 'x', type: 'text', formatVersion: 5, folders: [], documents: [] }),
    );

    await waitFor(() => events.some((event) => event.kind === 'manifest'));
  }, 10_000);

  it('reports a locks change when the locks sidecar is created (a file that did not exist at watch start)', async () => {
    start();
    await fs.writeFile(path.join(projectDir, '.falang-locks.json'), JSON.stringify({ locks: [] }));

    await waitFor(() => events.some((event) => event.kind === 'locks'));
  }, 10_000);

  it('reports a drivers change when falang/drivers/ is created lazily and written into', async () => {
    start();
    await fs.mkdir(path.join(driversDir(projectDir), 'my-driver'), { recursive: true });
    await fs.writeFile(path.join(driversDir(projectDir), 'my-driver', 'driver.config.json'), '{}');
    await waitFor(() => events.some((event) => event.kind === 'drivers'));

    events.length = 0;
    await sleep(300);
    await fs.writeFile(path.join(driversDir(projectDir), 'my-driver', 'x.h'), '// edit');
    await waitFor(() => events.some((event) => event.kind === 'drivers'));
  }, 10_000);

  it('suppresses a drivers event for a write markOwnDriversWrite was just called for', async () => {
    await fs.mkdir(path.join(driversDir(projectDir), 'd'), { recursive: true });
    start();
    watcher.markOwnDriversWrite();
    await fs.writeFile(path.join(driversDir(projectDir), 'd', 'a.h'), '//');
    await sleep(600);
    expect(events.filter((event) => event.kind === 'drivers')).toEqual([]);
  }, 10_000);

  it('stop() prevents further events', async () => {
    start();
    watcher.stop();
    await fs.writeFile(path.join(documentsDir(projectDir), 'after-stop.json'), JSON.stringify({ id: 'after-stop' }));
    await sleep(500);
    expect(events).toEqual([]);
  }, 10_000);
});
