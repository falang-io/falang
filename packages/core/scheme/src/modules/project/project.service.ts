import { action, makeObservable, observable } from 'mobx';
import { TreeDirectoryStore } from './tree-directory.store.js';
import type { IProject, IProjectDirectory } from './types.js';

export class ProjectService {
  @observable id: string | null = null;
  @observable name: string | null = null;
  @observable type: string | null = null;
  @observable rootDirectory: TreeDirectoryStore | null = null;

  constructor() {
    makeObservable(this);
  }

  @action setProject(project: IProject) {
    this.id = project.id;
    this.name = project.name;
    this.type = project.type;
  }

  @action setRootDirectory(rootDirectory: IProjectDirectory) {
    this.rootDirectory = new TreeDirectoryStore(rootDirectory);
  }
}
