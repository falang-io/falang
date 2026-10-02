import { randomUUID } from 'node:crypto';
import type { IProjectTreeFolder } from '@falang/dto';
import {
  checkDocumentPlacement,
  findSectionFolder,
  normalizeWorkflowProjectLayout,
  sectionForDocumentType,
  WORKFLOW_FIXED_FOLDERS,
} from '@falang/workflow-dto';
import { UnprocessableEntityException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { Document } from '../documents/document.entity.js';
import { Folder } from '../folders/folder.entity.js';
import { orderFoldersParentFirst } from '../versioning/folder-order.js';

export const toTreeFolder = (folder: Folder): IProjectTreeFolder => ({
  id: folder.id,
  name: folder.name,
  parentId: folder.parentId,
  fixedKind: folder.fixedKind,
});

/**
 * Idempotently inserts the missing fixed section folders of a workflow project (ADR 0055 (private));
 * returns the project's folders afterwards. `INSERT … ON CONFLICT DO NOTHING` on the unique
 * `(project_id, fixed_kind)` index, so two concurrent callers never create duplicates.
 */
export const ensureFixedFolders = async (manager: EntityManager, projectId: string): Promise<Folder[]> => {
  const folderRepo = manager.getRepository(Folder);
  const existing = await folderRepo.find({ where: { projectId } });
  const present = new Set(existing.filter((folder) => folder.fixedKind !== null).map((folder) => folder.fixedKind));
  const missing = WORKFLOW_FIXED_FOLDERS.filter((section) => !present.has(section.kind));
  if (missing.length === 0) return existing;
  await manager
    .createQueryBuilder()
    .insert()
    .into(Folder)
    .values(
      missing.map((section) => ({
        id: randomUUID(),
        name: section.name,
        parentId: null,
        projectId,
        fixedKind: section.kind,
      })),
    )
    .orIgnore()
    .execute();
  return folderRepo.find({ where: { projectId } });
};

/** A project's folders as plain tree folders (what the pure layout checks take). */
export const loadTreeFolders = async (
  folders: Repository<Folder>,
  projectId: string,
): Promise<IProjectTreeFolder[]> => {
  const rows = await folders.find({ where: { projectId } });
  return rows.map((row) => toTreeFolder(row));
};

/**
 * The folder a document of `type` actually goes into: an omitted/`null` folder means the section
 * root of its type (so REST, MCP and the in-app agent need no layout knowledge); anything else must
 * satisfy the fixed-layout rules, else 422 with the reason (`@falang/workflow-dto`'s `project-layout`).
 */
export const resolveDocumentFolder = async (
  folders: Repository<Folder>,
  projectId: string,
  type: string,
  folderId: string | null,
): Promise<string | null> => {
  let tree = await loadTreeFolders(folders, projectId);
  let target = folderId;
  const kind = sectionForDocumentType(type);
  if (target === null && kind !== null) {
    let section = findSectionFolder(kind, tree);
    if (!section) {
      await ensureFixedFolders(folders.manager, projectId);
      tree = await loadTreeFolders(folders, projectId);
      section = findSectionFolder(kind, tree);
    }
    target = section?.id ?? null;
  }
  const reason = checkDocumentPlacement(type, target, tree);
  if (reason !== null) throw new UnprocessableEntityException(reason);
  return target;
};

/** The id of the section folder of `kind` in `projectId`, creating the sections first if needed. */
export const requireSectionFolderId = async (
  manager: EntityManager,
  projectId: string,
  kind: string,
): Promise<string> => {
  const folders = await ensureFixedFolders(manager, projectId);
  const section = findSectionFolder(
    kind,
    folders.map((folder) => toTreeFolder(folder)),
  );
  if (!section) throw new Error(`Section folder "${kind}" is missing in project "${projectId}"`);
  return section.id;
};

/**
 * Applies `normalizeWorkflowProjectLayout` to a project's stored folders/documents: ensures the
 * sections, then inserts copies, re-parents and moves what the normalisation changed and drops empty
 * root-level user folder trees. Idempotent. Used by the `FixedFolders` migration and by version
 * restore; callers run it inside a transaction when they need atomicity.
 */
export const normalizeStoredProjectLayout = async (manager: EntityManager, projectId: string): Promise<void> => {
  const folderRepo = manager.getRepository(Folder);
  const folderRows = await ensureFixedFolders(manager, projectId);
  const documentRepo = manager.getRepository(Document);
  const documentRows = await documentRepo.find({
    where: { projectId },
    select: { id: true, type: true, folderId: true, pinned: true },
  });
  const folders = folderRows.map((row) => toTreeFolder(row));
  const result = normalizeWorkflowProjectLayout(
    folders,
    documentRows.map((row) => ({ id: row.id, type: row.type, folderId: row.folderId, pinned: row.pinned })),
    { createId: () => randomUUID() },
  );

  const existingById = new Map(folderRows.map((folder) => [folder.id, folder]));
  const keptIds = new Set(result.folders.map((folder) => folder.id));

  const created = orderFoldersParentFirst(result.folders.filter((folder) => !existingById.has(folder.id)));
  for (const folder of created) {
    // oxlint-disable-next-line no-await-in-loop -- a parent row must exist before its children.
    await folderRepo.insert({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      projectId,
      fixedKind: null,
    });
  }
  for (const folder of result.folders) {
    const current = existingById.get(folder.id);
    if (current && current.parentId !== folder.parentId) {
      // oxlint-disable-next-line no-await-in-loop
      await folderRepo.update({ id: folder.id, projectId }, { parentId: folder.parentId });
    }
  }
  const currentDocumentFolder = new Map(documentRows.map((row) => [row.id, row.folderId]));
  for (const document of result.documents) {
    if (currentDocumentFolder.get(document.id) !== document.folderId) {
      // oxlint-disable-next-line no-await-in-loop
      await documentRepo.update({ id: document.id, projectId }, { folderId: document.folderId });
    }
  }
  const dropped = orderFoldersParentFirst(folderRows.filter((folder) => !keptIds.has(folder.id))).toReversed();
  for (const folder of dropped) {
    // oxlint-disable-next-line no-await-in-loop -- children before parents.
    await folderRepo.delete({ id: folder.id, projectId });
  }
};
