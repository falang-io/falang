import type { IProjectTreeFolder } from '@falang/dto';
import { WORKFLOW_FIXED_FOLDERS, findSectionFolder } from '@falang/workflow-dto';

/** `Functions/Telegram`-style path of a folder (stored names joined by `/`); `null` for the project root. */
export const folderPath = (folderId: string | null, folders: readonly IProjectTreeFolder[]): string | null => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const seen = new Set<string>();
  let currentId = folderId;
  while (currentId !== null && !seen.has(currentId)) {
    const folder = byId.get(currentId);
    if (!folder) break;
    seen.add(currentId);
    names.unshift(folder.name);
    currentId = folder.parentId;
  }
  return names.length > 0 ? names.join('/') : null;
};

/** Prompt lines naming the fixed sections and their folder ids, so the model can pass a `folderId`. */
export const describeSections = (folders: readonly IProjectTreeFolder[]): string[] => {
  const rows = WORKFLOW_FIXED_FOLDERS.flatMap((section) => {
    const folder = findSectionFolder(section.kind, folders);
    return folder
      ? [`- ${folder.name} (folderId ${folder.id}): ${section.documentTypes.map((type) => `"${type}"`).join(', ')}`]
      : [];
  });
  if (rows.length === 0) return [];
  return [
    'Fixed sections of this project (folderId, accepted document types). Each document type lives only in its ' +
      'own section or a subfolder of it; omit folderId on create_* to use the section root:',
    ...rows,
  ];
};
