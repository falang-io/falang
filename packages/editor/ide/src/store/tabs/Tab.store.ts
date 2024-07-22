import { TDocumentIcon } from '@falang/infrastructures-all';
import { computed, makeObservable, observable } from 'mobx';
import { v4 as uuidV4 } from 'uuid';
import { IdeStore } from '../../Ide.store';
import { IdeFileStore } from './../IdeDirectories.store';

export const ProjectTabTypes = [
  "scheme"
] as const;

export type TProjectTabType = typeof ProjectTabTypes[number];

export abstract class TabStore {
  readonly id = uuidV4();
  @observable public fixed = false;
  @observable public loaded = false
  @observable path = '';


  constructor(
    public readonly ide: IdeStore,
    public readonly tabType: TProjectTabType,
  ) {
    makeObservable(this);
  }

  get modified() {
    return this.getIsModified();
  }

  protected getIsModified() {
    return false;
  }

  @computed get title() {
    return this.getTitle()
  }
  
  protected getTitle(): string {
    return ''
  }

  abstract getFileContents(): string;

  dispose() {
    
  }

  goBack() {

  }

  goForward() {
    
  }

  onSave() {
    
  }

  getIcon(): TDocumentIcon | null {
    return null;
  }
}