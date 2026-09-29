import { makeObservable, observable } from 'mobx';
import { TreeDocumentStore } from './tree-document.store.js';
import type { IProjectDirectory } from './types.js';

export class TreeDirectoryStore {
  readonly documents = observable<TreeDocumentStore>([]);
  readonly directories = observable<TreeDirectoryStore>([]);
  @observable id: string;
  @observable name: string;
  @observable opened = false;

  constructor(dir: IProjectDirectory) {
    this.id = dir.id;
    this.name = dir.name;
    makeObservable(this);
    this.directories.replace(dir.children.map((child) => new TreeDirectoryStore(child)));
    this.documents.replace(dir.documents.map((doc) => new TreeDocumentStore(doc)));
  }
}
