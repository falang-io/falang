import { navigationStore } from './navigation-store.js';

export interface ICreateNewProjectParams {
  readonly dir: string;
  readonly name: string;
  readonly board: string;
}

/**
 * Creates a project and opens it — called from `NewProjectDialog`'s "Create" button (see
 * `new-project-dialog-store.ts`), which is now the only entry point for "create a new project" (the
 * old, dialog-free version of this function just opened a system folder picker with no board choice
 * at all — see ADR 0032 (private), task A). `setup`/`loop`/
 * `Devices` are created separately, by `main`'s `IPC.projectCreate` handler
 * (`ensureArduinoProjectDocuments`, see `main/ensure-project-documents.ts`) as part of the same call
 * this makes — never from the renderer (a StrictMode double-create bug found and fixed 2026-09-21,
 * see that ADR's own section) — unlike `@falang/desktop-app-sketch`'s equivalent, this app has exactly
 * one project type and no per-type default document to create here. Throws on failure (e.g.
 * `projectDir` already holds a project) — the dialog store shows the message inline rather than closing.
 */
export const createNewProject = async (params: ICreateNewProjectParams): Promise<void> => {
  await globalThis.falang.project.create(params.dir, { name: params.name, type: 'arduino', board: params.board });
  await globalThis.falang.recentProjects.add(params.dir, params.name);
  navigationStore.openProject(params.dir, params.name);
};

export const openExistingProject = async (dir?: string): Promise<void> => {
  const targetDir = dir ?? (await globalThis.falang.dialog.openProjectFolder());
  if (!targetDir) return;
  const manifest = await globalThis.falang.project.open(targetDir);
  await globalThis.falang.recentProjects.add(targetDir, manifest.name);
  navigationStore.openProject(targetDir, manifest.name);
};
