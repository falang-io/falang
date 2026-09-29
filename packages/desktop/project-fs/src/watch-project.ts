import { watch, type FSWatcher } from 'node:fs';
import { documentsDir, MANIFEST_FILENAME } from './paths.js';
import { LOCKS_SIDECAR_NAME } from './locks.js';

export type TProjectChangeKind = 'document' | 'manifest' | 'locks';

export interface IProjectChangeEvent {
  kind: TProjectChangeKind;
  /** Only present for `kind: 'document'` — the changed documents' ids (`documents/<id>.json`'s `<id>`), coalesced across the debounce window. */
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
}

const DEBOUNCE_MS = 200;
const OWN_WRITE_SUPPRESS_MS = 1000;
const DOCUMENT_EXT = '.json';

const locksFilename = `${LOCKS_SIDECAR_NAME}.json`;

interface IPendingChanges {
  manifest: boolean;
  locks: boolean;
  documentIds: Set<string>;
}

const emptyPending = (): IPendingChanges => ({ manifest: false, locks: false, documentIds: new Set() });

/**
 * Watches `<projectDir>/falang/schemes/`, `<projectDir>/falang.json` and
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

  const flush = (): void => {
    debounceTimer = null;
    const toFlush = pending;
    pending = emptyPending();
    if (toFlush.manifest) onChange({ kind: 'manifest' });
    if (toFlush.locks) onChange({ kind: 'locks' });
    if (toFlush.documentIds.size > 0) onChange({ kind: 'document', documentIds: [...toFlush.documentIds] });
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
    const documentId = filename.slice(0, -DOCUMENT_EXT.length);
    const suppressedAt = ownWriteAt.get(documentId);
    if (typeof suppressedAt === 'number' && Date.now() - suppressedAt < OWN_WRITE_SUPPRESS_MS) return;
    pending.documentIds.add(documentId);
    scheduleFlush();
  };

  const rootWatcher: FSWatcher = watch(projectDir, (_eventType, filename) =>
    handleRootEvent(filename?.toString() ?? null),
  );

  // `falang/schemes/` always exists once `createProject` has run, but stay defensive — a watcher
  // on a project mid-creation (or one whose `falang/schemes/` dir was removed out-of-band)
  // shouldn't crash the whole watcher, it should just not report document-level changes.
  let documentsWatcher: FSWatcher | null = null;
  try {
    documentsWatcher = watch(documentsDir(projectDir), (_eventType, filename) =>
      handleDocumentsEvent(filename?.toString() ?? null),
    );
  } catch {
    documentsWatcher = null;
  }

  const stop = (): void => {
    rootWatcher.close();
    documentsWatcher?.close();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  };

  const markOwnWrite = (documentId: string): void => {
    ownWriteAt.set(documentId, Date.now());
  };

  return { stop, markOwnWrite };
};
