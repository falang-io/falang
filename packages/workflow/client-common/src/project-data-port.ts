import type { INode } from '@falang/dto';
import { workflowApi } from './api-client.js';
import type { IApiProjectDocument, IApiProjectTree } from './api-types.js';

/** `PATCH`-style partial update of one document — what `ProjectSync`'s saves send. */
export interface IProjectDocumentUpdate {
  readonly name?: string;
  readonly folderId?: string | null;
  readonly root?: INode | null;
  readonly data?: unknown;
  /** This tab's own agent-lock owner id, if it holds one on this document (ADR 0034 (private) §2.4). */
  readonly lockOwner?: string;
}

/**
 * Where an open project's folders and documents are loaded from and written to — `ProjectSync`'s storage seam.
 * A signed-in user's project lives on the backend (`createHttpProjectDataPort`); a guest editing a template
 * without an account keeps it in the browser (`GuestProjectDataPort`).
 */
export interface IProjectDataPort {
  getTree(): Promise<IApiProjectTree>;
  getDocuments(): Promise<IApiProjectDocument[]>;
  createFolder(input: { id: string; name: string; parentId: string | null }): Promise<unknown>;
  updateFolder(folderId: string, input: { name?: string; parentId?: string | null }): Promise<unknown>;
  deleteFolder(folderId: string): Promise<unknown>;
  createDocument(input: IApiProjectDocument & { folderId: string | null }): Promise<unknown>;
  updateDocument(documentId: string, input: IProjectDocumentUpdate): Promise<unknown>;
  deleteDocument(documentId: string): Promise<unknown>;
}

/** The backend's project routes (`/projects/:id/tree`, `/documents`, `/folders`). */
export const createHttpProjectDataPort = (projectId: string): IProjectDataPort => ({
  getTree: () => workflowApi.getProjectTree(projectId),
  getDocuments: () => workflowApi.getProjectDocuments(projectId),
  createFolder: (input) => workflowApi.createFolder(projectId, input),
  updateFolder: (folderId, input) => workflowApi.updateFolder(projectId, folderId, input),
  deleteFolder: (folderId) => workflowApi.deleteFolder(projectId, folderId),
  createDocument: (input) => workflowApi.createDocument(projectId, input),
  updateDocument: (documentId, input) => workflowApi.updateDocument(projectId, documentId, input),
  deleteDocument: (documentId) => workflowApi.deleteDocument(projectId, documentId),
});
