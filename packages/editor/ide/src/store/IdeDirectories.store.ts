import { TProjectTypeName } from '@falang/infrastructures-all';
import { IDirectory, IFile } from '@falang/frontend-core';
import { action, makeObservable, observable } from 'mobx';
import { timeStamp } from 'node:console';

export const ideLanguages = [
  'text',
  'typescript',
  'rust',
] as const;

export const fileTypes = [
  "scheme"
] as const;

export type TFileType = typeof fileTypes[number];

export type TIdeLanguage = typeof ideLanguages[number];

export class IdeFileStore implements IFile {
  @observable name: string
  @observable path: string
  readonly id: string
  readonly parentDirectory: IdeDirectoryStore;
  readonly type: string

  constructor({ name, path, type, id }: IFile, parentDirectory: IdeDirectoryStore) {
    this.type = type;
    this.id = id;
    this.parentDirectory = parentDirectory;
    this.name = name;
    this.path = path;
    makeObservable(this);
  }
}

export class IdeDirectoryStore implements IDirectory {
  readonly loaded = true;
  @observable opened = false;
  @observable name = "";
  @observable path = "";
  readonly directories = observable<IdeDirectoryStore>([]);
  readonly files = observable<IdeFileStore>([]);
  @observable parentPath = "";

  constructor() {
    makeObservable(this);
  }

  @action load(dir: IDirectory, openedPaths?: string[], parentPath?: string) {
    this.name = dir.name;
    this.path = dir.path;
    this.opened = !!openedPaths && openedPaths.includes(this.path) || !parentPath;
    if (!openedPaths) openedPaths = this.getOpenedDirectoriesPaths();
    this.parentPath = parentPath || "";
    this.directories.replace(dir.directories.map((dir) => {
      const d = new IdeDirectoryStore();
      d.load(dir, openedPaths, this.path);
      return d;
    }));
    this.files.replace(dir.files.map((file) => {
      return new IdeFileStore(file, this)
    }));
  }

  getOpenedDirectoriesPaths(): string[] {
    const returnValue: string[] = [];
    this.directories.forEach((dir) => {
      if (dir.opened) {
        returnValue.push(dir.path, ...dir.getOpenedDirectoriesPaths());
      }
    });
    return returnValue;
  }
}