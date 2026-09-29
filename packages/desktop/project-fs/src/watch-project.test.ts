import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from './project.js';
import { documentPath, manifestPath } from './paths.js';
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

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-watch-test-'));
    await createProject(projectDir, { name: 'Watched', type: 'text' });
    events = [];
    watcher = watchProject(projectDir, (event) => events.push(event));
  });

  afterEach(async () => {
    watcher.stop();
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('reports a document change with the changed id, debounced and coalesced', async () => {
    await fs.writeFile(documentPath(projectDir, 'doc-1'), JSON.stringify({ id: 'doc-1' }));
    await fs.writeFile(documentPath(projectDir, 'doc-1'), JSON.stringify({ id: 'doc-1', name: 'again' }));

    await waitFor(() => events.some((event) => event.kind === 'document'));

    const documentEvents = events.filter((event) => event.kind === 'document');
    // Two rapid writes to the same file inside the debounce window coalesce into one event.
    expect(documentEvents).toHaveLength(1);
    expect(documentEvents[0]?.documentIds).toEqual(['doc-1']);
  }, 10_000);

  it('suppresses a document event for a write markOwnWrite was just called for', async () => {
    watcher.markOwnWrite('doc-own');
    await fs.writeFile(documentPath(projectDir, 'doc-own'), JSON.stringify({ id: 'doc-own' }));

    // Give the watcher a full debounce window plus slack to prove no event arrives, rather than
    // asserting instantly (which would pass trivially before the debounce timer even fires).
    await sleep(600);
    expect(events.filter((event) => event.kind === 'document')).toEqual([]);
  }, 10_000);

  it('reports a manifest change when falang.json is rewritten', async () => {
    await fs.writeFile(
      manifestPath(projectDir),
      JSON.stringify({ name: 'x', type: 'text', formatVersion: 4, folders: [], documents: [] }),
    );

    await waitFor(() => events.some((event) => event.kind === 'manifest'));
  }, 10_000);

  it('reports a locks change when the locks sidecar is created (a file that did not exist at watch start)', async () => {
    await fs.writeFile(path.join(projectDir, '.falang-locks.json'), JSON.stringify({ locks: [] }));

    await waitFor(() => events.some((event) => event.kind === 'locks'));
  }, 10_000);

  it('stop() prevents further events', async () => {
    watcher.stop();
    await fs.writeFile(documentPath(projectDir, 'doc-after-stop'), JSON.stringify({ id: 'doc-after-stop' }));
    await sleep(500);
    expect(events).toEqual([]);
  }, 10_000);
});
