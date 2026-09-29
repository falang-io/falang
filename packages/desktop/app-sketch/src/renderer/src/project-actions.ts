import { message } from 'antd';
import { generateUuid } from './generate-uuid.js';
import { buildDefaultDocumentRoot, type DocumentType } from './desktop-project-store.js';
import { PROJECT_TYPES, isProjectType } from '../../shared/project-types.js';
import type { IProjectOpenResult } from '../../shared/project-open-result.js';
import { navigationStore } from './navigation-store.js';

export interface ICreateNewProjectParams {
  readonly dir: string;
  readonly name: string;
  readonly type: string;
}

/**
 * Creates a project, its one default document (see `../../shared/project-types.ts`), and opens it —
 * called from `NewProjectDialog`'s "Create" button (see `new-project-dialog-store.ts`), which is now
 * the only entry point for "create a new project" (the old, dialog-free version of this function
 * just opened a system folder picker and hardcoded `type: 'text'` regardless of what the user was
 * actually building — see ADR 0005 (private)'s "Implementation notes (project types, new-project
 * dialog, single default document — 2026-09-20)"). Throws on failure (e.g. `projectDir` already
 * holds a project) — the dialog store shows the message inline rather than closing.
 */
export const createNewProject = async (params: ICreateNewProjectParams): Promise<void> => {
  await globalThis.falang.project.create(params.dir, { name: params.name, type: params.type });
  await globalThis.falang.recentProjects.add(params.dir, params.name);

  if (isProjectType(params.type)) {
    const { defaultDocument } = PROJECT_TYPES[params.type];
    // `defaultDocument.type` is one of this project type's own `documentTypes`, always a real
    // `DocumentType` — but `project-types.ts` is dto-agnostic (see its own doc comment) and can't
    // import that renderer-only union, so the string is cast back to it here.
    const root = buildDefaultDocumentRoot(defaultDocument.type as DocumentType);
    await globalThis.falang.document.create(params.dir, {
      document: { id: generateUuid(), name: defaultDocument.name, root, type: defaultDocument.type },
      folderId: null,
    });
  }

  navigationStore.openProject(params.dir, params.name, params.type);
};

/**
 * The one entry point for "open a project" — used by the Welcome page's own Open button, its
 * recent-projects list, and the native `File > Open Project` menu item. `IPC.projectOpen` migrates
 * an old-format project in place before opening it (see ADR 0005 (private)'s "Implementation
 * notes (old-format project migration)"), rolling itself back to the pre-conversion state on
 * failure — so a failure here always means "the project directory is unchanged, try again after
 * fixing whatever the message describes" rather than "half-converted, needs manual repair."
 */
export const openExistingProject = async (dir?: string): Promise<void> => {
  const targetDir = dir ?? (await globalThis.falang.dialog.openProjectFolder());
  if (!targetDir) return;
  // oxlint-disable-next-line init-declarations -- assigned in the try block immediately below
  let result: IProjectOpenResult;
  try {
    result = await globalThis.falang.project.open(targetDir);
  } catch (error) {
    message.error(`Failed to open project: ${error instanceof Error ? error.message : String(error)}`, 8);
    throw error;
  }
  if (result.converted) message.success('Project converted to the new format', 6);
  await globalThis.falang.recentProjects.add(targetDir, result.manifest.name);
  navigationStore.openProject(targetDir, result.manifest.name, result.manifest.type);
};
