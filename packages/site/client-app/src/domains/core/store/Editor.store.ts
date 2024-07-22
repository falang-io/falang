import { SchemeStore } from '@falang/editor-scheme';
import { IFileSystemService, plugFileSystem } from '@falang/frontend-core';
import { makeObservable } from 'mobx';

export class EditorStore {
  private readonly _schemeStore: SchemeStore | null = null;
  readonly fs: IFileSystemService = plugFileSystem;

  constructor() {
    makeObservable(this);
  }

  get shemeLoaded() {
    return !!this._schemeStore;
  }

  get editor(): SchemeStore {
    if (!this._schemeStore) throw new Error('Editor not loaded');
    return this._schemeStore;
  }
}