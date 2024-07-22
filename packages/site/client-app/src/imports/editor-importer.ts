import { makeObservable, observable, runInAction } from 'mobx';
import { importEditor } from './importEditor';

export class EditorImporter {

  @observable private _editorLoaded = false;
  private _importedEditor: Awaited<ReturnType<typeof importEditor>> | null = null;

  constructor() {
    makeObservable(this);
  }

  get isLoaded() {
    return this._editorLoaded;
  }

  async load() {
    if (this._importedEditor) return;
    this._importedEditor = await importEditor();
    runInAction(() => {
      this._editorLoaded = true;
    })
  }

  get importedEditor(): Awaited<ReturnType<typeof importEditor>> {
    if (!this._editorLoaded || !this._importedEditor) throw new Error('editor not loaded');
    return this._importedEditor;
  }
}