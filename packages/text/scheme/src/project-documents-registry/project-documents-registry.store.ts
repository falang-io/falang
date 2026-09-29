import type { IProjectTreeDocument } from '@falang/dto';
import { action, makeObservable, ObservableMap } from 'mobx';

/**
 * Project-wide list of documents, kept up to date by the host app (e.g. `packages/desktop/app-sketch`)
 * so any open document's blocks can reference another document by id — currently only the `link`
 * node needs this, mirroring how `@falang/typescript-scheme`'s `TypesRegistryStore` feeds
 * cross-node type lookups.
 */
export class ProjectDocumentsRegistryStore {
  readonly documents = new ObservableMap<string, IProjectTreeDocument>();

  constructor() {
    makeObservable(this);
  }

  @action setDocuments(documents: IProjectTreeDocument[]) {
    this.documents.clear();
    for (const document of documents) this.documents.set(document.id, document);
  }

  dispose() {
    this.documents.clear();
  }
}
