import type { IApiProjectDocument, IApiProjectTree } from '../api-types.js';
import type { IProjectDataPort, IProjectDocumentUpdate } from '../project-data-port.js';
import type { IGuestDocument, IGuestProjectState } from './guest-project.js';

/**
 * A JSON copy — the stored form of a project is JSON anyway, and the documents `ProjectSync` hands over are
 * MobX-observable, which `structuredClone` refuses.
 */
// oxlint-disable-next-line prefer-structured-clone -- see above: the input may be a MobX proxy.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * `ProjectSync`'s storage for a guest: the project lives in memory (`state`, mutated in place) and every write
 * reports the new state through `onChange` — the guest workspace saves it as the draft. Writes already arrive
 * debounced (`ProjectSync`'s `PendingSaves`), so the whole state is simply rewritten each time.
 */
export class GuestProjectDataPort implements IProjectDataPort {
  private readonly state: IGuestProjectState;
  private readonly onChange: (state: IGuestProjectState) => void;

  constructor(state: IGuestProjectState, onChange: (state: IGuestProjectState) => void) {
    this.state = clone(state);
    this.onChange = onChange;
  }

  /** A copy of the current project. */
  snapshot(): IGuestProjectState {
    return clone(this.state);
  }

  getTree(): Promise<IApiProjectTree> {
    return Promise.resolve({
      folders: this.state.folders.map((folder) => ({ ...folder })),
      documents: this.state.documents.map((document) => ({
        id: document.id,
        type: document.type,
        name: document.name,
        folderId: document.folderId,
        pinned: document.pinned,
      })),
    });
  }

  getDocuments(): Promise<IApiProjectDocument[]> {
    return Promise.resolve(
      this.state.documents.map((document) => ({
        id: document.id,
        type: document.type,
        name: document.name,
        ...(document.root ? { root: clone(document.root) } : {}),
        ...(document.data === null ? {} : { data: clone(document.data) }),
      })),
    );
  }

  createFolder(input: { id: string; name: string; parentId: string | null }): Promise<unknown> {
    this.state.folders.push({ id: input.id, name: input.name, parentId: input.parentId });
    return this.changed();
  }

  updateFolder(folderId: string, input: { name?: string; parentId?: string | null }): Promise<unknown> {
    const folder = this.state.folders.find((candidate) => candidate.id === folderId);
    if (!folder) return Promise.reject(new Error('Folder not found'));
    if (typeof input.name === 'string') folder.name = input.name;
    if ('parentId' in input) folder.parentId = input.parentId ?? null;
    return this.changed();
  }

  /** Removes the folder with everything below it, as the backend does. */
  deleteFolder(folderId: string): Promise<unknown> {
    const removed = new Set([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const folder of this.state.folders) {
        if (folder.parentId !== null && removed.has(folder.parentId) && !removed.has(folder.id)) {
          removed.add(folder.id);
          grew = true;
        }
      }
    }
    this.state.folders = this.state.folders.filter((folder) => !removed.has(folder.id));
    this.state.documents = this.state.documents.filter(
      (document) => document.folderId === null || !removed.has(document.folderId),
    );
    return this.changed();
  }

  createDocument(input: IApiProjectDocument & { folderId: string | null }): Promise<unknown> {
    const document: IGuestDocument = {
      id: input.id,
      type: input.type,
      name: input.name,
      folderId: input.folderId,
      pinned: false,
      root: input.root ? clone(input.root) : null,
      data: clone(input.data ?? null),
    };
    this.state.documents.push(document);
    return this.changed();
  }

  updateDocument(documentId: string, input: IProjectDocumentUpdate): Promise<unknown> {
    const document = this.state.documents.find((candidate) => candidate.id === documentId);
    if (!document) return Promise.reject(new Error('Document not found'));
    if (typeof input.name === 'string') document.name = input.name;
    if ('folderId' in input) document.folderId = input.folderId ?? null;
    if ('root' in input) document.root = input.root ? clone(input.root) : null;
    if ('data' in input) document.data = clone(input.data ?? null);
    return this.changed();
  }

  deleteDocument(documentId: string): Promise<unknown> {
    this.state.documents = this.state.documents.filter((document) => document.id !== documentId);
    return this.changed();
  }

  private changed(): Promise<null> {
    this.onChange(this.snapshot());
    return Promise.resolve(null);
  }
}
