import { LangState } from '@falang/frontend-core';
import { makeObservable, observable } from 'mobx';
import { DocumentDto } from '../../api';
import { RootStore } from './Root.store';

const LOCAL_STORAGE_KEY = 'local-document';

export class LocalStore {
  @observable hasLocalDocument = false;

  constructor() {
    this.hasLocalDocument = this.checkHasDocument();
    makeObservable(this);    
  }

  removeDocument() {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    this.hasLocalDocument = false;
  }

  saveDocument(json: DocumentDto) {
    json.id = 'local';
    json.name = 'Temp';
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(json));
  }

  getDocument(): DocumentDto | null {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if(!data) return null;
    return JSON.parse(data);
  }

  checkHasDocument(): boolean {
    return !!localStorage.getItem(LOCAL_STORAGE_KEY);
  }
}