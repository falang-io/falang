import {
  createDocument,
  createFolder,
  createProject,
  openProject,
  type IProjectManifest,
} from '@falang/desktop-project-fs';
import type { IProjectDocument } from '@falang/dto';
import { CODE_LANGUAGE_BY_DOCUMENT_TYPE } from '@falang/simple-code-dto';
import { moveOldProjectIntoBackup, restoreProjectFromBackup } from './backup.js';
import { readOldManifest } from './detect.js';
import { listOldFolderSpecs, readOldDocumentEntries, type IOldDocumentEntry } from './read-old-tree.js';
import { convertCodeDocument } from './convert-code-project.js';
import { convertTextDocument } from './convert-text-project.js';
import { convertLogicDocument } from './convert-logic-project.js';
import { convertExportConfiguration } from './convert-export-config.js';

const CONSOLE_LANGUAGE_BY_OLD_TYPE: Record<string, keyof typeof CODE_LANGUAGE_BY_DOCUMENT_TYPE> = {
  console_cpp: 'simple-code-cpp',
  console_js: 'simple-code-js',
  console_ts: 'simple-code-ts',
  console_php: 'simple-code-php',
  console_rust: 'simple-code-rust',
};

/** Old `type` → new manifest `type` (purely informational metadata — see ADR 0005 (private)'s "Implementation notes"). */
const convertProjectType = (oldType: string): string => CONSOLE_LANGUAGE_BY_OLD_TYPE[oldType] ?? oldType;

const convertDocument = (
  oldProjectType: string,
  entry: IOldDocumentEntry,
  rootIdToDocumentId: ReadonlyMap<string, string>,
): IProjectDocument => {
  const codeDocumentType = CONSOLE_LANGUAGE_BY_OLD_TYPE[oldProjectType];
  if (codeDocumentType) return convertCodeDocument(entry.scheme, CODE_LANGUAGE_BY_DOCUMENT_TYPE[codeDocumentType]);
  if (oldProjectType === 'text') return convertTextDocument(entry.scheme);
  if (oldProjectType === 'logic') return convertLogicDocument(entry.scheme, rootIdToDocumentId);
  throw new Error(`Unsupported old project type: "${oldProjectType}"`);
};

const convertDocumentOrThrow = (
  oldProjectType: string,
  entry: IOldDocumentEntry,
  rootIdToDocumentId: ReadonlyMap<string, string>,
): IProjectDocument => {
  try {
    return convertDocument(oldProjectType, entry, rootIdToDocumentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert old document at ${entry.filePath}: ${message}`, { cause: error });
  }
};

/**
 * Converts the old-format project at `projectDir` (`project.falangproject.json`, `version: 2`) into
 * the current project-fs format in place, backing up only the falang-owned entries (the old manifest
 * and `falang/` directory — see `backup.ts`'s own doc comment) into `<projectDir>/backup/` first;
 * every non-falang entry (the user's own `code/`, README, `.git`, …) stays untouched at the project
 * root throughout. Also converts the old app's own `falang/config/export.json`, if present, into
 * `falang/config/logic-export.json` (`convert-export-config.ts`). Idempotent guard is the caller's
 * responsibility — call only after `isOldFormatProject(projectDir)` returns `true` (see `detect.ts`).
 *
 * Written entirely through `@falang/desktop-project-fs`'s own public primitives (`createProject`/
 * `createFolder`/`createDocument`) rather than its internal manifest/path helpers (not exported —
 * `project-fs` is deliberately domain- and internals-agnostic, see ADR 0005 (private)), the same
 * way `packages/desktop/app-sketch`'s own document-creation flow does.
 *
 * **Automatic rollback on failure**: if any document fails to convert (a converter bug, or an old
 * project not following a convention this converter assumes — see ADR 0005 (private)'s
 * "Implementation notes (old-format project migration)" for real examples), `projectDir` is left
 * exactly as it was before this call — the partial new-format output written so far is discarded and
 * the backed-up original is moved back to `projectDir`'s root (`restoreProjectFromBackup`) — rather
 * than stuck half-converted with the original stranded under `backup/`. The original conversion
 * error is then rethrown (wrapped with rollback-failure context if the rollback itself also fails)
 * so the caller — `packages/desktop/app-sketch`'s `IPC.projectOpen` handler — can surface it to the user.
 */
export const convertOldProject = async (projectDir: string): Promise<IProjectManifest> => {
  const oldManifest = await readOldManifest(projectDir);
  const backupDir = await moveOldProjectIntoBackup(projectDir);

  try {
    const entries = await readOldDocumentEntries(backupDir);

    // Old `call_function`/`call_api` nodes reference their target by the target *document's root
    // icon's* id (`IOldScheme.root.id`), not by the document's own id (`IOldScheme.id`, which is
    // what the new `call-function`/`call-api` node's `data.schemeId` must hold — see
    // `convert-logic-leaf.ts`'s `convertCall` doc comment). Built project-wide, up front, since a
    // call can target any document anywhere in the tree, not just ones under the same folder.
    const rootIdToDocumentId = new Map<string, string>(entries.map((entry) => [entry.scheme.root.id, entry.scheme.id]));

    await createProject(projectDir, { name: oldManifest.name, type: convertProjectType(oldManifest.type) });

    const folderIdByPath = new Map<string, string | null>([['', null]]);
    for (const spec of listOldFolderSpecs(entries)) {
      const parentId = spec.parentPath === null ? null : (folderIdByPath.get(spec.parentPath) ?? null);
      // oxlint-disable-next-line no-await-in-loop -- must create parent folders before children, and record each real id (createFolder assigns it) before the next iteration needs it
      const folder = await createFolder(projectDir, { name: spec.name, parentId });
      folderIdByPath.set(spec.path, folder.id);
    }

    for (const entry of entries) {
      const document = convertDocumentOrThrow(oldManifest.type, entry, rootIdToDocumentId);
      const folderId = folderIdByPath.get(entry.relativeDir.join('/')) ?? null;
      // oxlint-disable-next-line no-await-in-loop -- createDocument read-modifies-writes the shared manifest file; concurrent calls would race and drop entries
      await createDocument(projectDir, { document, folderId });
    }

    await convertExportConfiguration(backupDir, projectDir);

    return await openProject(projectDir);
  } catch (error) {
    try {
      await restoreProjectFromBackup(projectDir, backupDir);
    } catch (rollbackError) {
      throw new Error(
        `Old-project conversion failed and automatic rollback also failed — "${projectDir}" may be left in a ` +
          `partially-converted state (the original project should still be recoverable under "${backupDir}"): ` +
          `${error instanceof Error ? error.message : String(error)}`,
        { cause: rollbackError },
      );
    }
    throw error;
  }
};
