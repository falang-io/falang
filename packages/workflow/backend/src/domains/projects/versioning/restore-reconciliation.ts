import type { IProjectTreeFolder } from '@falang/dto';
import type { IProjectSnapshot } from '@falang/versioning';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type IIntegrationsDocumentData,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import { assertCredentialIdsNotOwnedByOtherProject } from '../../integrations/credential-id-ownership.js';
import { mergeIntegrationsDataForRestore } from '../../integrations/credentials-codec.js';
import type { Document } from '../documents/document.entity.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FoldersService } from '../folders/folders.service.js';
import { orderFoldersParentFirst } from './folder-order.js';

export interface IRestoreDeps {
  documentsRepo: Repository<Document>;
  documentsService: DocumentsService;
  foldersService: FoldersService;
}

/**
 * Overwrites the working copy's folders in place to match `snapshotFolders`, given the folders that
 * currently exist (`currentFolders`) — see ADR 0025 (private), "restore ...
 * folders reconciled (create missing, rename/re-parent existing, delete extra — parents before
 * children on create, children before parents on delete)". Ordering matters: creating parent-first
 * means a child's `parentId` always resolves; re-parenting *before* deleting means a folder that
 * survives the restore is moved out from under a to-be-deleted parent before that parent is removed
 * (its FK is `onDelete: 'CASCADE'` — deleting a parent while a survivor still points at it would
 * take the survivor down too).
 */
export const reconcileFolders = async (
  deps: IRestoreDeps,
  projectId: string,
  ownerId: string,
  snapshotFolders: readonly IProjectTreeFolder[],
  currentFolders: readonly IProjectTreeFolder[],
): Promise<void> => {
  const currentById = new Map(currentFolders.map((folder) => [folder.id, folder]));
  const snapshotById = new Map(snapshotFolders.map((folder) => [folder.id, folder]));

  const toCreate = orderFoldersParentFirst(snapshotFolders.filter((folder) => !currentById.has(folder.id)));
  for (const folder of toCreate) {
    // oxlint-disable-next-line no-await-in-loop -- must respect parent-before-child creation order.
    await deps.foldersService.create(projectId, ownerId, {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
    });
  }

  for (const folder of snapshotFolders) {
    const current = currentById.get(folder.id);
    if (!current || (current.name === folder.name && current.parentId === folder.parentId)) continue;
    // oxlint-disable-next-line no-await-in-loop -- reparenting must complete before any delete below.
    await deps.foldersService.update(projectId, ownerId, folder.id, { name: folder.name, parentId: folder.parentId });
  }

  const toDelete = orderFoldersParentFirst(
    currentFolders.filter((folder) => !snapshotById.has(folder.id)),
  ).toReversed();
  for (const folder of toDelete) {
    // oxlint-disable-next-line no-await-in-loop -- must respect children-before-parent delete order.
    await deps.foldersService.delete(projectId, ownerId, folder.id);
  }
};

/**
 * Restoring the pinned `integrations` document is a merge, never a plain overwrite (decision 1 in
 * ADR 0025 (private)): the instance list and every non-secret field come from
 * the snapshot, but each surviving instance keeps its *currently stored* encrypted secret values.
 * Written directly through the repository (not `DocumentsService.update`, whose write path assumes
 * *plaintext* incoming secret values and would try to re-encrypt what `mergeIntegrationsDataForRestore`
 * already returns pre-encrypted) — the one document this reconciliation can't route through the
 * normal service methods.
 */
const restoreIntegrationsDocument = async (
  deps: IRestoreDeps,
  current: Document,
  snapshotData: unknown,
  integrations: readonly IWorkflowIntegration[],
  name: string,
): Promise<void> => {
  const snapshot = (snapshotData ?? { instances: [] }) as IIntegrationsDocumentData;
  await assertCredentialIdsNotOwnedByOtherProject(deps.documentsRepo, current.projectId, snapshot);
  const stored = current.data as IIntegrationsDocumentData | null;
  current.name = name;
  current.data = mergeIntegrationsDataForRestore(snapshot, stored, integrations);
  await deps.documentsRepo.save(current);
};

/**
 * Overwrites the working copy's documents in place to match `snapshot`, given the documents that
 * currently exist (`currentDocuments`, straight from the repository — never `DocumentsService.listFull`,
 * whose masked `integrations` output would defeat the merge above). Pinned documents (today, only
 * `integrations`) are never deleted, matching `DocumentsService.delete`'s own guard, and are always
 * merged rather than overwritten when they already exist.
 */
export const reconcileDocuments = async (
  deps: IRestoreDeps,
  projectId: string,
  ownerId: string,
  snapshot: IProjectSnapshot,
  currentDocuments: readonly Document[],
  integrations: readonly IWorkflowIntegration[],
): Promise<void> => {
  const currentById = new Map(currentDocuments.map((document) => [document.id, document]));
  const snapshotIds = new Set<string>();

  for (const document of snapshot.documents) {
    snapshotIds.add(document.id);
    const current = currentById.get(document.id);

    if (document.type === INTEGRATIONS_DOCUMENT_TYPE) {
      // The pinned `integrations` document is auto-seeded on project creation and never deletable,
      // so `current` being unset here is defensive-only, not expected in practice. A snapshot's
      // secret fields are always already blanked (`stripIntegrationsSecretsForExport`), so writing
      // them straight through needs no encryption step, unlike a real client write.
      // oxlint-disable-next-line no-await-in-loop
      await (current
        ? restoreIntegrationsDocument(deps, current, document.data, integrations, document.name)
        : deps.documentsRepo.insert(
            deps.documentsRepo.create({
              id: document.id,
              type: document.type,
              name: document.name,
              folderId: document.folderId,
              projectId,
              pinned: document.pinned,
              root: document.root ?? null,
              data: document.data ?? null,
            }) as Parameters<Repository<Document>['insert']>[0],
          ));
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    await (current
      ? deps.documentsService.update(projectId, ownerId, document.id, {
          name: document.name,
          folderId: document.folderId,
          root: document.root ?? null,
          data: document.data ?? null,
        })
      : deps.documentsService.create(projectId, ownerId, {
          id: document.id,
          type: document.type,
          name: document.name,
          folderId: document.folderId,
          root: document.root ?? null,
          data: document.data ?? null,
        }));
  }

  for (const document of currentDocuments) {
    if (document.pinned || snapshotIds.has(document.id)) continue;
    // oxlint-disable-next-line no-await-in-loop
    await deps.documentsService.delete(projectId, ownerId, document.id);
  }
};
