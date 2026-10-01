import { promises as fs, watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';
import { documentRelPosix } from './layout.js';
import { readManifest } from './manifest.js';
import { withProjectLock } from './project-lock.js';
import { documentsDir, driversDir, falangDir, DRIVERS_DIRNAME, MANIFEST_FILENAME } from './paths.js';
import { LOCKS_SIDECAR_NAME } from './locks.js';

export type TProjectChangeKind = 'document' | 'manifest' | 'locks' | 'drivers';

export interface IProjectChangeEvent {
  kind: TProjectChangeKind;
  /** Only present for `kind: 'document'` — the changed documents' ids (mapped from the changed file's path through the manifest), coalesced across the debounce window. */
  documentIds?: string[];
}

export interface IProjectWatcher {
  /** Stops both underlying `fs.watch`s and clears any pending debounce timer. Idempotent. */
  stop: () => void;
  /**
   * Call this right when (or just before) `main` itself writes a document — the watcher drops the
   * matching filesystem event for `documentId` for `OWN_WRITE_SUPPRESS_MS`, so the app's own
   * autosave doesn't come back around as a "reload from disk" / "changed on disk" prompt for the
   * tab that's still open and unchanged from the renderer's point of view.
   */
  markOwnWrite: (documentId: string) => void;
  /** Same idea for `falang/drivers/` (ADR 0054 (private)): call around `main`'s own driver write so it doesn't come back as a `drivers` event. */
  markOwnDriversWrite: () => void;
}

const DEBOUNCE_MS = 200;
const OWN_WRITE_SUPPRESS_MS = 1000;
const DOCUMENT_EXT = '.json';

const locksFilename = `${LOCKS_SIDECAR_NAME}.json`;

interface IPendingChanges {
  manifest: boolean;
  locks: boolean;
  /** Latest arrival time of a change under `falang/drivers/`, or `null`. */
  drivers: number | null;
  /** Changed files, as POSIX paths relative to `falang/schemes/` → when the event arrived. */
  documentPaths: Map<string, number>;
}

const emptyPending = (): IPendingChanges => ({
  manifest: false,
  locks: false,
  drivers: null,
  documentPaths: new Map(),
});

const SCHEMES_PREFIX = 'falang/schemes/';

/** Document id for a changed file path (relative to `falang/schemes/`): via the manifest, else by the file's own JSON `id`; `null` if neither works. */
const resolveDocumentId = async (
  projectDir: string,
  relPath: string,
  pathToId: Map<string, string> | null,
): Promise<string | null> => {
  const known = pathToId?.get(relPath);
  if (known) return known;
  try {
    const raw = JSON.parse(await fs.readFile(path.join(documentsDir(projectDir), ...relPath.split('/')), 'utf8')) as {
      id?: unknown;
    };
    return typeof raw.id === 'string' ? raw.id : null;
  } catch {
    return null;
  }
};

/**
 * Watches `<projectDir>/falang/schemes/` (recursively — documents sit in per-folder subdirectories), `<projectDir>/falang.json` and
 * `<projectDir>/.falang-locks.json` for external changes — an MCP server (or another process, git
 * checkout, sync folder, …) editing the project folder while a desktop app has it open. Plain
 * `fs.watch` (no `chokidar`), debounced ~200ms and coalesced into one `onChange` call per kind per
 * window, per ADR 0029 (private)'s "Filesystem watcher" decision (an external editor's writes are picked up,
 * own writes suppressed). `main`/IPC glue (starting one per open project, stopping the previous one, pushing events to the renderer) is each app's own
 * — this function only knows plain Node.
 *
 * `falang.json` and the locks sidecar are watched by watching `projectDir` itself and filtering
 * by filename, not by `fs.watch`-ing each file directly — the locks sidecar usually doesn't exist
 * yet on a fresh project (no lock has ever been taken), and `fs.watch` throws `ENOENT` on a path
 * that doesn't exist, so watching for its *creation* needs the containing directory's own watcher.
 */
export const watchProject = (projectDir: string, onChange: (event: IProjectChangeEvent) => void): IProjectWatcher => {
  const ownWriteAt = new Map<string, number>();
  let pending = emptyPending();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let ownDriversWriteAt = 0;

  const flushDocuments = async (documentPaths: Map<string, number>): Promise<void> => {
    // Document files are located through the manifest (name-based paths), so map paths → ids now.
    const pathToId = await withProjectLock(projectDir, () => readManifest(projectDir)).then(
      (manifest) =>
        new Map(
          manifest.documents.map((entry) => [documentRelPosix(manifest, entry).slice(SCHEMES_PREFIX.length), entry.id]),
        ),
      () => null,
    );
    const ids = new Set<string>();
    for (const [relPath, eventAt] of documentPaths) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of paths per debounce window
      const documentId = await resolveDocumentId(projectDir, relPath, pathToId);
      if (documentId === null) continue;
      const suppressedAt = ownWriteAt.get(documentId);
      if (typeof suppressedAt === 'number' && eventAt - suppressedAt < OWN_WRITE_SUPPRESS_MS) continue;
      ids.add(documentId);
    }
    if (!stopped && ids.size > 0) onChange({ kind: 'document', documentIds: [...ids] });
  };

  const flush = (): void => {
    debounceTimer = null;
    const toFlush = pending;
    pending = emptyPending();
    if (toFlush.manifest) onChange({ kind: 'manifest' });
    if (toFlush.locks) onChange({ kind: 'locks' });
    if (toFlush.drivers !== null && toFlush.drivers - ownDriversWriteAt >= OWN_WRITE_SUPPRESS_MS) {
      onChange({ kind: 'drivers' });
    }
    if (toFlush.documentPaths.size > 0) flushDocuments(toFlush.documentPaths).catch(() => null);
  };

  const scheduleFlush = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  };

  const handleRootEvent = (filename: string | null): void => {
    if (!filename) return;
    if (filename === MANIFEST_FILENAME) {
      pending.manifest = true;
      scheduleFlush();
    } else if (filename === locksFilename) {
      pending.locks = true;
      scheduleFlush();
    }
  };

  const handleDocumentsEvent = (filename: string | null): void => {
    if (!filename || !filename.endsWith(DOCUMENT_EXT)) return;
    pending.documentPaths.set(filename.split(path.sep).join('/'), Date.now());
    scheduleFlush();
  };

  const handleDriversEvent = (): void => {
    pending.drivers = Date.now();
    scheduleFlush();
  };

  // `falang/drivers/` only exists once a project has a custom driver, so it is attached lazily: a
  // non-recursive watcher on `falang/` notices its creation (and reports it as a change itself).
  let driversWatcher: FSWatcher | null = null;
  const attachDriversWatcher = (): void => {
    if (driversWatcher || stopped) return;
    try {
      driversWatcher = watch(driversDir(projectDir), { recursive: true }, () => handleDriversEvent());
    } catch {
      driversWatcher = null;
    }
  };
  let falangWatcher: FSWatcher | null = null;
  try {
    falangWatcher = watch(falangDir(projectDir), (_eventType, filename) => {
      if (filename?.toString() !== DRIVERS_DIRNAME) return;
      attachDriversWatcher();
      handleDriversEvent();
    });
  } catch {
    falangWatcher = null;
  }
  attachDriversWatcher();

  const rootWatcher: FSWatcher = watch(projectDir, (_eventType, filename) =>
    handleRootEvent(filename?.toString() ?? null),
  );

  // `falang/schemes/` always exists once `createProject` has run, but stay defensive — a watcher
  // on a project mid-creation (or one whose `falang/schemes/` dir was removed out-of-band)
  // shouldn't crash the whole watcher, it should just not report document-level changes.
  let documentsWatcher: FSWatcher | null = null;
  try {
    documentsWatcher = watch(documentsDir(projectDir), { recursive: true }, (_eventType, filename) =>
      handleDocumentsEvent(filename?.toString() ?? null),
    );
  } catch {
    documentsWatcher = null;
  }

  const stop = (): void => {
    stopped = true;
    rootWatcher.close();
    documentsWatcher?.close();
    falangWatcher?.close();
    driversWatcher?.close();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  };

  const markOwnWrite = (documentId: string): void => {
    ownWriteAt.set(documentId, Date.now());
  };

  const markOwnDriversWrite = (): void => {
    ownDriversWriteAt = Date.now();
  };

  return { stop, markOwnWrite, markOwnDriversWrite };
};
