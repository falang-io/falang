import { action, makeObservable, observable, runInAction } from 'mobx';
import { RootStore } from '../core/store/Root.store';
import { IdeStore } from '@falang/editor-ide';
import { importEditor } from '../../imports/importEditor';
import type { IDirectory, IFileSystemService, ILinkInfo } from '@falang/frontend-core';
import { structuresByExample } from './structuresByExample';



export class ExamplesPageStore {

  @observable private _ide: IdeStore | null = null;
  @observable private _example = '';

  constructor(readonly root: RootStore) {
    makeObservable(this);
  }

  async load(example: string) {
    this.unload();
    //await importEditor()
    const [importedIde, importedEditor] = await Promise.all([
      import('@falang/editor-ide'),
      importEditor(),
    ]);
    const _this = this;
    const fs: IFileSystemService = {
      loadDirectory: function (path: string): Promise<IDirectory> {
        return Promise.resolve(structuresByExample[example]);
      },
      loadFile: async function (path: string): Promise<string> {
        const result = await fetch(path);
        return result.text();
      },
      saveFile: async function (path: string, contents: string): Promise<void> {
        //_this.tryPage.pseudoSaveFile(path, contents);
      },
      resolvePath: async function (...args: string[]): Promise<string> {
        return args.join('/');
      },
      createDirectory: function (path: string): Promise<void> {
        throw new Error('Function not implemented.');
      },
      deleteDirectory: function (path: string): Promise<void> {
        throw new Error('Function not implemented.');
      },
      deleteFile: function (path: string): Promise<void> {
        throw new Error('Function not implemented.');
      },
      renameFile: function (oldPath: string, newPath: string): Promise<void> {
        throw new Error('Function not implemented.');
      },
      getAppPath: function (name: 'home' | 'appData' | 'userData' | 'sessionData' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'): Promise<string> {
        throw new Error('Function not implemented.');
      },
      fileExists: async function (filePath: string): Promise<boolean> {
        return true;
      },
      openDirectory: function (defaultValue?: string | undefined): Promise<string | null> {
        throw new Error('Function not implemented.');
      },
      basename: async function (path: string): Promise<string> {
        return path.replace(/^(.*)\//, '');
      },
      dirname: async function (path: string): Promise<string> {
        return path.replace(/\/[^\/]*$/, '');
      },
      readConfig: () => {
        throw new Error('Function not implemented.');
      },
      writeConfig: () => {
        throw new Error('Function not implemented.');
      },
      copyEmptyProject: function (type: string, path: string): Promise<void> {
        throw new Error('Function not implemented.');
      },
      copyDirectory: function (from: string, to: string): Promise<void> {
        throw new Error('Function not implemented.');
      },
      copyFile: function (from: string, to: string): Promise<void> {
        throw new Error('Function not implemented.');
      },
      relativePath: async function (from: string, to: string): Promise<string> {
        console.log('relative', { from , to });
        return `${from}${to}`;
      },
      getLinksOptions: function (projectRoot: string): Promise<ILinkInfo[]> {
        throw new Error('Function not implemented.');
      },
      getLinkInfo: function (projectRoot: string, id: string): Promise<ILinkInfo> {
        throw new Error('Function not implemented.');
      },
      getResourcesPath: function (): Promise<string> {
        throw new Error('Function not implemented.');
      }
    };
    const _frontRootStore = new importedEditor.core.FrontRootStore({
      contextMenu: this.root.dropdown,
      fs,
      clipboard: {
        getValue() {
          return Promise.resolve(null);
        },
        setValue(value) {
          return Promise.resolve();
        },
      },
      getDomRectById: (id) => {
        const element = window.document.getElementById(id);
        if (!element) throw new Error(`Element not found by id: ${id}`);
        return element.getBoundingClientRect();
      },
      getProjectStructure() {
        return Promise.resolve(structuresByExample[example])
      },
      getRootPath() {
        return Promise.resolve(`/examples-files/${example}`);
      },
      links: {
        getLinkInfo(projectRoot, id) {
          throw new Error('Not implemented');
        },
        getLinksOptions(projectRoot) {
          throw new Error('Not implemented');
        },
        linkClicked(id) {
          throw new Error('Not implemented');
        },
      },
      async loadFile(path) {
        const result = await fetch(path);
        return result.text()
        //return JSON.stringify(_this.tryPage.editor.toDto());
      },
      messageBox: {
        show(params) {
          throw new Error('Not implemented');
        },
      },
    });
    this._ide = new IdeStore({
      fileSystem: fs,
      frontRoot: _frontRootStore,
      readonly: true,
    });
    runInAction(() => {
      this._ide?.setIsEditing(false);
    });
    this._ide.loadProject(`/examples-files/${example}`)
    
  }

  @action unload() {
    this._ide?.dispose();
    this._ide = null;
  }

  get ide() {
    return this._ide;
  }
}