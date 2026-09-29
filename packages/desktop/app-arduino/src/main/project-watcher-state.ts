import { watchProject, type IProjectChangeEvent, type IProjectWatcher } from '@falang/desktop-project-fs';
import type { BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc-channels.js';

/**
 * One `IProjectWatcher` at a time — this app opens one project per window (see
 * ADR 0029 (private)'s "Filesystem watcher" decision). Module-level state, mirroring the
 * existing `recent-projects.ts`/`settings.ts` posture (no DI container in `main`, plain module
 * singletons keyed by "there's only ever one of these running at once").
 */
let currentWatcher: IProjectWatcher | null = null;

/** Stops the previously-open project's watcher, if any. Safe to call with none active. Called both when another project opens and when the window closes. */
export const stopProjectWatcher = (): void => {
  currentWatcher?.stop();
  currentWatcher = null;
};

/** Starts watching `dir`, pushing every change to the renderer over `IPC.projectChanged`. Stops any previously-active watcher first (opening a second project replaces the first, never runs both). */
export const startProjectWatcher = (dir: string, getMainWindow: () => BrowserWindow | null): void => {
  stopProjectWatcher();
  currentWatcher = watchProject(dir, (event: IProjectChangeEvent) => {
    getMainWindow()?.webContents.send(IPC.projectChanged, event);
  });
};

/** Call right when `main` itself writes a document (the renderer's debounced autosave, via `IPC.documentWrite`) so the watcher drops the matching filesystem event instead of bouncing it back to the renderer as an external change. No-op if no watcher is active. */
export const markOwnDocumentWrite = (documentId: string): void => {
  currentWatcher?.markOwnWrite(documentId);
};
