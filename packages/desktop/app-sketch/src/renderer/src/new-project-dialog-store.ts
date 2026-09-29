import { action, makeObservable, observable, runInAction } from 'mobx';
import { createNewProject } from './project-actions.js';
import type { TProjectType } from '../../shared/project-types.js';
import { reportError } from '../../shared/report-error.js';

/**
 * `baseDir` comes from `main` (`project:suggest-new-location`, an absolute, OS-native path) — this
 * just appends `name` using whichever separator `baseDir` itself already uses, since the renderer
 * has no `node:path` (see the memory rule about node-only value imports breaking electron-vite's
 * renderer dev server, the same reason `project-types.ts` stays dependency-free).
 */
const joinPath = (baseDir: string, name: string): string => {
  const separator = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/';
  return `${baseDir}${baseDir.endsWith(separator) ? '' : separator}${name}`;
};

/**
 * State for the "New Project…" dialog (`components/new-project-dialog.tsx`) — replaces the old
 * dialog-free `createNewProject()` flow, which just opened a system folder picker and always wrote
 * `type: 'text'`. Mirrors the old app's own `NewProjectDialogState` (name/directory/type, directory
 * auto-follows name until hand-edited) — see ADR 0005 (private)'s "Implementation notes (project
 * types, new-project dialog, single default document — 2026-09-20)". Module-level singleton, same
 * shape as `settings-modal-store.ts`/`versioning-settings-modal-store.ts`.
 */
export class NewProjectDialogStore {
  @observable isOpen = false;
  @observable name = '';
  @observable directory = '';
  @observable directoryEditedByUser = false;
  @observable type: TProjectType = 'text';
  @observable isCreating = false;
  @observable error: string | null = null;

  private baseDir = '';

  constructor() {
    makeObservable(this);
  }

  /** Resets the form and asks `main` for a suggested `<Documents>/Falang/Project{N}` location. */
  @action open(): void {
    this.isOpen = true;
    this.name = '';
    this.directory = '';
    this.directoryEditedByUser = false;
    this.type = 'text';
    this.isCreating = false;
    this.error = null;
    this.baseDir = '';
    globalThis.falang.project
      .suggestNewLocation()
      .then((suggestion) => {
        runInAction(() => {
          // A directory the user already started editing by the time this resolves wins — don't
          // clobber a fast typist.
          if (this.directoryEditedByUser) return;
          this.baseDir = suggestion.baseDir;
          this.name = suggestion.name;
          this.directory = suggestion.dir;
        });
      })
      .catch((error: unknown) => reportError('Failed to suggest a new project location', error));
  }

  @action close(): void {
    this.isOpen = false;
  }

  /** Changing the name keeps following `<baseDir>/<name>` until the user edits the directory field directly (`setDirectory`) — same behavior as the old app's dialog. */
  @action setName(name: string): void {
    this.name = name;
    if (!this.directoryEditedByUser && this.baseDir) this.directory = joinPath(this.baseDir, name);
  }

  @action setDirectory(directory: string): void {
    this.directoryEditedByUser = true;
    this.directory = directory;
  }

  @action setType(type: TProjectType): void {
    this.type = type;
  }

  async selectDirectory(): Promise<void> {
    const selected = this.directory
      ? await globalThis.falang.dialog.newProjectFolder(this.directory)
      : await globalThis.falang.dialog.newProjectFolder();
    if (selected) runInAction(() => this.setDirectory(selected));
  }

  /** The "Create" button — also double-checked here (not just via the form's own `required` rules), since this is what the store-level unit test exercises directly. */
  async create(): Promise<void> {
    const name = this.name.trim();
    const directory = this.directory.trim();
    if (!name || !directory) {
      runInAction(() => {
        this.error = name ? 'Project folder is required' : 'Project name is required';
      });
      return;
    }
    runInAction(() => {
      this.isCreating = true;
      this.error = null;
    });
    try {
      await createNewProject({ dir: directory, name, type: this.type });
      runInAction(() => {
        this.isCreating = false;
        this.isOpen = false;
      });
    } catch (error) {
      runInAction(() => {
        this.isCreating = false;
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }
}

export const newProjectDialogStore = new NewProjectDialogStore();
