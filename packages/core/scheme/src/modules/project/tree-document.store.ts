import { makeObservable, observable } from 'mobx';
import type { IProjectDocument } from './types.js';
import type { INode } from '@falang/dto';

export class TreeDocumentStore {
  readonly id: string;
  @observable name: string;
  @observable.ref data: INode | null = null;

  constructor(doc: IProjectDocument) {
    this.id = doc.id;
    this.name = doc.id;
    this.data = doc.data;
    makeObservable(this);
  }
}
