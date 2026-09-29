import { action, makeObservable, observable, runInAction } from 'mobx';
import { createNewProject } from './project-actions.js';
import { DEFAULT_BOARD_FQBN } from '../../shared/board.js';
import { reportError } from '../../shared/report-error.js';

/**
 * `baseDir` comes from `main` (`project:suggest-new-location`, an absolute, OS-native path) — this
 * just appends `name` using whichever separator `baseDir` itself already uses, since the renderer
 * has no `node:path` (mirrors `@falang/desktop-app-sketch`'s file of the same name/shape).
 */
const joinPath = (baseDir: string, name: string): string => {
  const separator = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/';
  return `${baseDir}${baseDir.endsWith(separator) ? '' : separator}${name}`;
};

/**
 * State for the "New Project…" dialog (`components/new-project-dialog.tsx`) — replaces the old
 * dialog-free `createNewProject()` flow, which just opened a system folder picker with no board
 * choice at all. Mirrors `@falang/desktop-app-sketch`'s own `NewProjectDialogStore`
 * (name/directory auto-follows name until hand-edited) with the project-type radio group replaced by
 * a board `Select` — see ADR 0032 (private), "Decision → 1".
 * Module-level singleton, same shape as `settings-modal-store.ts`/`versioning-settings-modal-store.ts`.
 */
export class NewProjectDialogStore {
  @observable isOpen = false;
  @observable name = '';
  @observable directory = '';
  @observable directoryEditedByUser = false;
  @observable board: string = DEFAULT_BOARD_FQBN;
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
    this.board = DEFAULT_BOARD_FQBN;
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

  /** Changing the name keeps following `<baseDir>/<name>` until the user edits the directory field directly (`setDirectory`) — same behavior as `@falang/desktop-app-sketch`'s dialog. */
  @action setName(name: string): void {
    this.name = name;
    if (!this.directoryEditedByUser && this.baseDir) this.directory = joinPath(this.baseDir, name);
  }

  @action setDirectory(directory: string): void {
    this.directoryEditedByUser = true;
    this.directory = directory;
  }

  @action setBoard(board: string): void {
    this.board = board;
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
      await createNewProject({ dir: directory, name, board: this.board });
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
