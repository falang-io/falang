import { action, computed, makeObservable, observable, ObservableMap, reaction, runInAction } from 'mobx';
import { EditorImporter } from '../../imports/editor-importer';
import { RootStore } from '../core/store/Root.store';
import { createRegistry } from '@falang/registry';
import { getJsDoc } from './temp-docs/jsDoc';
import { getTsDoc } from './temp-docs/tsDoc';
import { checker, IconStore, SchemeStore } from '@falang/editor-scheme';
import { getTextInfrastructureConfig, LogicInfrastructureType, LogicProjectStore, TextInfrastructureType, TextProjectStore, checkerLogic } from '@falang/infrastructures-all';
import { TSchemeMode } from '@falang/editor-scheme';
import { getLogicExportConfig } from './temp-docs/getLogicExportConfig';
import { FrontRootStore, IDirectory, IFileSystemService, ILinkInfo } from '@falang/frontend-core';
import { getClipboardService } from '../core/lib/Clipboard.service';

export const TryPageLanguages = [
  'logic',
  'txt',
  //'ts',
  //'rust',
  //'cpp',
  //'php'
] as const;

export type TTryPageLanguage = typeof TryPageLanguages[number];

export const tryPageLanguageNames: Record<TTryPageLanguage, string> = {
  //cpp: 'C++',
  logic: 'Logic',
  //php: 'PHP',
  //rust: 'Rust',
  //ts: 'TS',
  txt: 'Text',
}

export class TryPageStore {
  readonly editorImporter = new EditorImporter();
  @observable _editor: SchemeStore | null = null;
  @observable selectedLanguage: TTryPageLanguage = 'logic';
  @observable private _loaded = false;
  @observable pickerVisible = false;
  @observable schemePickerVisible = false;
  @observable currentColor: string = "#FFFFFF";
  @observable currentSchemeBackgroundColor: string = "#C0E0E8";
  @observable editorVisible = true;
  readonly frontRootStore: FrontRootStore;
  readonly codeMap = new ObservableMap<string, string>();
  readonly registry = createRegistry({
    'reactColor': () => import('react-color'),
  });
  @observable selectedCodeTab = 'ts';

  constructor(readonly root: RootStore) {
    makeObservable(this);
    reaction<[TTryPageLanguage, boolean]>(() => [this.selectedLanguage, this.loaded], ([lang, loaded]) => {
      if (!loaded) return;
      this.editorVisible = false;
      if(this._editor) this._editor.dispose();
      switch (lang) {
        case 'logic':
          this._loadLogic();
          //this.editor.(getJsDoc());
          break;
        case 'txt':
          this._loadText();
          /*import('./temp-docs/textDoc').then(({ getTextDoc }) => {
            this.editor.loadFromJson(getTextDoc());
            setTimeout(() => {
              this.editor.getJson();
              runInAction(() => {
                this.editorVisible = true;
                this.updateCode();
              });
            }, 3000);
          });*/
          break;
        /*case 'ts':
          this.editor.loadFromJson(getTsDoc());
          break;*/
      }
    });
    setInterval(() => {
      this.updateCode();
    }, 1000);

    const _this = this;

    const fs: IFileSystemService = {
      loadDirectory: function (path: string): Promise<IDirectory> {
        throw new Error('Function not implemented.');
      },
      loadFile: function (path: string): Promise<string> {
        throw new Error('Function not implemented.');
      },
      saveFile: async function (path: string, contents: string): Promise<void> {
        _this.pseudoSaveFile(path, contents);
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
    this.frontRootStore = new FrontRootStore({
      contextMenu: this.root.dropdown,
      fs,
      clipboard: getClipboardService(),
      getDomRectById: (id) => {
        const element = window.document.getElementById(id);
        if (!element) throw new Error(`Element not found by id: ${id}`);
        return element.getBoundingClientRect();
      },
      getProjectStructure() {
        return Promise.resolve({
          directories: [],
          files: [{
            id: 'id',
            name: 'name',
            path: '/falang/schemas/doc.falang.json',
            type: 'function',
          }],
          name: '',
          path: '/',
        })
      },
      getRootPath() {
        return Promise.resolve('');
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
        return JSON.stringify(_this.editor.toDto());
      },
      messageBox: {
        show(params) {
          throw new Error('Not implemented');
        },
      },
    });
  }

  get loaded() {
    return this._loaded;
  }

  @computed get codeClassName(): string {
    const language = this.selectedLanguage;
    if(language === 'txt') return '';
    return '';
    //return `language-${this.editorImporter.importedEditor.editor.PrismLanguages[language]}`;
  }

  @action setEditorMode(mode: TSchemeMode) {
    this.editor.mode = mode;
  }

  get editor() {
    if (!this._editor) throw new Error('Editor not loaded');
    return this._editor;
  }

  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return this.root.waitFor(() => this._load());
  }

  @action unload() {
    this._editor?.dispose();
    this._editor = null;
    this._loaded = false;
  }

  @action loadLanguage(lang: TTryPageLanguage) {
    this.selectedLanguage = lang;
  }

  @computed get code() {
    return this.codeMap.get(this.selectedCodeTab) || 'Can`t generate';
  }

  private async _preload() {
    if (!this.registry.loaded) {
      await this.registry.load();
    }
    let frontRoot = this.frontRootStore;
    frontRoot = this.frontRootStore;
    if (!frontRoot) {
      throw new Error('Front root not loaded');
    }
    await this.editorImporter.load();
  }

  private async _loadText() {
    await this._preload();
    let frontRoot = this.frontRootStore;
    frontRoot = this.frontRootStore;
    if (!frontRoot) {
      throw new Error('Front root not loaded');
    }
    const projectStore = new TextProjectStore(frontRoot);
    const textInfrastructureType = new TextInfrastructureType();
    const { getTextDoc } = await import('./temp-docs/textDoc');
    this._editor = new this.editorImporter.importedEditor.editor.SchemeStore(
      frontRoot,
      textInfrastructureType,
      'lifegram',
      '',
      '',
      projectStore,
    );
    const icon = this._editor.createIconFromDto(getTextDoc(), null);
    this._editor.setRoot(icon);
    this._editor.id = icon.id;
    runInAction(() => {
      this._loaded = true;
      this.editor.setMode('edit')
    });
    setTimeout(() => {
      if(!this._editor) return;
      this._editor.sheduleCallback.flush();
      this._editor.resetPosition();
      this.editorVisible = true;
    }, 5);
  }

  @action pseudoSaveFile(path: string, content: string) {
    const codeResult = path.match(/\/code\/([^\/]*)\//);
    if(!codeResult) return;
    if(!path.includes('doc')) return;
    const codeName = codeResult[1];
    if(path.endsWith('.h')) return;
    const prism = this.editorImporter.importedEditor.prism.default;
    const html = prism.highlight(content.replace(/[ ]*\/\/ f:.*\n/g, '').replace(/[ ]*\/\/ Falang.*/g, ''), prism.languages[codeName], codeName);
    this.codeMap.set(codeName, html);
    /**
     *     const prism = this.editorImporter.importedEditor.prism;
    
    //const generateCode = this.editorImporter.importedEditor.editor.generateCode;
    const lang = this.selectedLanguage;
    if(lang === 'txt' || !this.editor.root) return;
    const projectStore = this._editor?.projectStore;
    if(!checker.isLogicProjectStore(projectStore)) return;
    //const code = generateCode(this.editor.root, lang);
    projectStore.buildCode().catch((err) => {
      console.error(err, 'asd');
    });*/
1    //const html = prism.highlight(code.replace(/[ ]*\/\/ Falang.*\n/g, '').replace(/[ ]*\/\/ Falang.*/g, ''), prism.languages[PrismLanguages[lang]], PrismLanguages[lang]);
    //this.code = html;
  }

  private async _loadLogic() {
    await this._preload();
    let frontRoot = this.frontRootStore;
    frontRoot = this.frontRootStore;
    if (!frontRoot) {
      throw new Error('Front root not loaded');
    }
    const projectStore = new LogicProjectStore(frontRoot);
    const textInfrastructureType = new LogicInfrastructureType();
    const { getMonteCarloDoc } = await import('./temp-docs/monteCarloDoc');
    this._editor = new this.editorImporter.importedEditor.editor.SchemeStore(
      frontRoot,
      textInfrastructureType,
      'logic',
      '',
      '',
      projectStore,
    );

    this._editor.onChange = () => {
      this.updateCode();
    };

    runInAction(() => {
      if(!this._editor) return;
      const icon = this._editor.createIconFromDto(getMonteCarloDoc(), null);
      this._editor.setRoot(icon);
      this._editor.id = icon.id;
      this._loaded = true;
      this.editor.setMode('edit');
      this.editor.name = 'calculateMonteCarlo'
    });
    setTimeout(() => {
      projectStore.exportConfiguration.setConfig(getLogicExportConfig());
      runInAction(() => {
        if(!this._editor) return;
        this._editor.sheduleCallback.flush();
        this._editor.resetPosition();
      });
    }, 5);
    setTimeout(() => {
      runInAction(() => {
        this.editorVisible = true;
        this.updateCode();
      });
    }, 100);
  }

  private async _load(): Promise<void> {
    if (!this.registry.loaded) {
      await this.registry.load();
    }
    let frontRoot = this.frontRootStore;
    frontRoot = this.frontRootStore;
    if (!frontRoot) {
      throw new Error('Front root not loaded');
    }
    await this.editorImporter.load();
    const projectStore = new TextProjectStore(frontRoot);
    const textInfrastructureType = new TextInfrastructureType();
    this._editor = new this.editorImporter.importedEditor.editor.SchemeStore(
      frontRoot,
      textInfrastructureType,
      '',
      '',
      '',
      projectStore,
    );
    this._editor.onChange = () => {
      this.updateCode();
    };
    runInAction(() => {
      this._loaded = true;
    })
  }

  @action updateCode() {
    if(!this._loaded) return;
    const prism = this.editorImporter.importedEditor.prism;
    
    //const generateCode = this.editorImporter.importedEditor.editor.generateCode;
    const lang = this.selectedLanguage;
    if(lang === 'txt' || !this.editor.root) return;
    const projectStore = this._editor?.projectStore;
    if(!checkerLogic.isLogicProjectStore(projectStore)) return;
    //const code = generateCode(this.editor.root, lang);
    projectStore.buildCode(true).then((result) => {
      if(!result) {
        this.codeMap.clear();
      }
    }).catch((err) => {
      console.error(err, 'asd');
    });

    //const html = prism.highlight(code.replace(/[ ]*\/\/ Falang.*\n/g, '').replace(/[ ]*\/\/ Falang.*/g, ''), prism.languages[PrismLanguages[lang]], PrismLanguages[lang]);
    //this.code = html;
  }


  @action setCurrentColor(color: string) {
    this.currentColor = color;
    if (!color.match(/^#[a-zA-Z0-9]{6}$/)) return;
    if (this.isIconsSelected) {
      const icons = this.selectedIcons;
      runInAction(() => {
        for (const icon of icons) {
          icon.block.color = color;
        }
      });
    } else {
      this.editor.defaultIconBackgroundColor = color;
    }
  }

  @action setSchemeBackgroundColor(color: string) {
    this.currentSchemeBackgroundColor = color;
    if (!color.match(/^#[a-zA-Z0-9]{6}$/)) return;
    this.editor.editorBackgroundColor = color;
  }

  @computed get selectedColors(): string[] {
    const colors = new Set<string>(this.selectedIcons.map(icon => icon.block.color));
    return Array.from(colors);
  }

  @computed get isIconsSelected(): boolean {
    return this.editor.selection.selectedIconsIds.length > 0;
  }

  @computed get selectedIcons(): IconStore[] {
    return this.editor.selection.getSelectedIcons();
  }

  @action setPickerVisible(visible: boolean) {
    this.pickerVisible = visible;
  }

  @action setSchemePickerVisible(visible: boolean) {
    this.schemePickerVisible = visible;
  }

  @computed get isCodeVisible() {
    return this.selectedLanguage !== 'txt' && !this.root.windowSize.isMobile;
  }
}