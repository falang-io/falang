/**
 * `IPC.projectSuggestNewLocation`'s result — `main`'s suggested `<Documents>/Falang/Project{N}`
 * location for a brand-new project, `N` the first index not already on disk. See
 * `main/ipc-handlers.ts`'s handler and `renderer/src/new-project-dialog-store.ts`'s `open()`.
 */
export interface INewProjectLocationSuggestion {
  /** `<Documents>/Falang` — the parent the dialog's directory field keeps following as the project name changes. */
  readonly baseDir: string;
  /** `Project{N}` — the suggested, not-yet-taken project name. */
  readonly name: string;
  /** `<baseDir>/<name>` — the full suggested project directory. */
  readonly dir: string;
}
