import { FrontRootStore, IContextMenuItem, IDirectory, IFile } from '@falang/frontend-core';
import { observable, makeObservable, runInAction } from 'mobx';
import { AppConfigService } from './AppConfig.service';
import { IMainService } from '../common/IMain.service';
import { getDocumentConfig, infrastructures, projectTypes, TProjectTypeName } from '@falang/infrastructures-all';
import { IdeStore } from '@falang/editor-ide';
import { buildMenu } from './buildMenu';
import { ISchemeDto, SchemeStore } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
export class AppState {
  @observable projectType: TProjectTypeName | null = null;
  @observable name: string | null = null;
  @observable ide: IdeStore;
  @observable exportSchemeStore: SchemeStore | null = null;
  @observable editable = true;
  @observable runnable = true;
  @observable aboutModalVisible = false;
  @observable version: string = '';
  private cssContents = "";
  readonly projectTypes = projectTypes;
  readonly config = new AppConfigService(this);
  readonly callbacksByMenuText = new Map<string, () => void>();

  readonly frontRoot: FrontRootStore;

  readonly mainApi: IMainService = (window as any).electron;

  constructor() {
    makeObservable(this);
    this.mainApi.methods.getVersion().then((v: string) => {
      this.version = v;  
    });
    this.frontRoot = new FrontRootStore({
      contextMenu: {
        showMenu: async (menu) => {
          const [builtMenu, byIds] = buildMenu(menu);
          const result = await this.mainApi.contextMenu.showMenu(builtMenu);
          if (!result) return;
          const menuItem = byIds[result];
          if (!menuItem) return;
          if (menuItem.onClick) {
            menuItem.onClick();
          }
        },
      },
      getDomRectById: (id) => {
        const element = window.document.getElementById(id);
        if (!element) throw new Error(`Element not found by id: ${id}`);
        return element.getBoundingClientRect();
      },
      messageBox: this.mainApi.messageBox,
      clipboard: {
        getValue: () => this.mainApi.methods.getClipboard(),
        setValue: (value: string): Promise<void> => this.mainApi.methods.setClipboard(value)
      },
      links: {
        getLinkInfo: this.mainApi.fs.getLinkInfo,
        getLinksOptions: this.mainApi.fs.getLinksOptions,
        linkClicked: async (id: string) => {
          const linkInfo = await this.mainApi.fs.getLinkInfo(this.ide.rootPath, id);
          if (linkInfo) {
            this.ide.filesService.loadFile(linkInfo.path);
          }
        },
      },
      getProjectStructure: async () => {
        //console.log('rooPath', this.ide.rootDirectory.path);
        const result = await this.mainApi.fs.loadDirectory(this.ide.rootDirectory.path);
        console.log(JSON.stringify(result));
        return result;
      },
      loadFile: async (path: string) => {
        return this.mainApi.fs.loadFile(path);
      },
      fs: this.mainApi.fs,
      setProjectMenu: async (menu) => {
        const addMenuToCallbacks = (item: IContextMenuItem) => {
          if(item.onClick) {
            this.callbacksByMenuText.set(item.text, item.onClick);  
            item.onClick = undefined;
          }
          item.children?.map((child) => addMenuToCallbacks(child));
        };
        menu.forEach((item) => addMenuToCallbacks(item));
        const result: IContextMenuItem[] = [...menu];
        const exportSvgText = this.frontRoot.lang.t('base:export_svg');
        result.push({
          text: exportSvgText,
        });
        this.callbacksByMenuText.set(exportSvgText, () => {
          this.exportSvg().catch((err) => {
            console.error(err);
            this.frontRoot.toaster.show({
              message: err instanceof Error ? err.message : JSON.stringify(err),
              intent: 'danger',
            });
          })
        });  
        this.mainApi.methods?.setProjectMenu(result);
      },
      getRootPath: async () => this.ide.rootPath,
    });
    this.ide = new IdeStore({
      frontRoot: this.frontRoot,
      fileSystem: this.mainApi.fs,
    });
    this.subscribeToEvents();
    setTimeout(() => this.initialize(), 10);
  }

  async exportSvg() {
    const startedId = this.frontRoot.toaster.show({ message: this.frontRoot.lang.t('base:export_started') });
    const css1FilePath = await this.frontRoot.fs.resolvePath(await this.frontRoot.fs.getResourcesPath(), 'style-svg.css');
    const css2FilePath = await this.frontRoot.fs.resolvePath(await this.frontRoot.fs.getResourcesPath(), 'prism-modified.css');
    const cssContents1 = await this.frontRoot.fs.loadFile(css1FilePath);
    const cssContents2 = await this.frontRoot.fs.loadFile(css2FilePath);
    this.cssContents = [cssContents1, cssContents2].join('\n\n');
    await this.exportSvgDirectory(this.ide.rootDirectory);    
    this.frontRoot.toaster.dismiss(startedId);
    const path = await this.frontRoot.fs.resolvePath(this.ide.rootPath, 'falang/svg');
    this.frontRoot.messageBox.show({
      text: `${this.frontRoot.lang.t('base:export_finished_to')} ${path}`,
      buttons: ["Ok"],
    });
    runInAction(() => {
      this.exportSchemeStore = null;
    })
  }

  private async exportSvgDirectory(dir: IDirectory) {
    for(const childDir of dir.directories) {
      await this.exportSvgDirectory(childDir);
    }
    for(const f of dir.files) {
      await this.exportSvgFile(f.path);
    }
  }

  private async exportSvgFile(path: string) {
    const projectTypeName = this.ide.projectTypeName;
    const documentDto: ISchemeDto = JSON.parse(await this.ide.fileSystem.loadFile(path));
    const documentTypeName = documentDto.type;
    const documentConfig = getDocumentConfig(projectTypeName, documentTypeName);    
    if(!(documentConfig.infrastructure in infrastructures)) {
      throw new Error(`Wrong infrastructure: ${documentConfig.infrastructure}`);
    }
    const infrastructure = infrastructures[documentConfig.infrastructure as keyof typeof infrastructures];
    if(!infrastructure) {
      throw new Error(`Infrastructure not found for ${projectTypeName}/${documentTypeName}`);
    }
    const relativePathArray = await this.getSchemeRelativePathArray(path);
    const fileBaseName = relativePathArray.pop();
    if(!fileBaseName) throw new Error('File base name not found');
    const exportSvgName = await this.frontRoot.fs.resolvePath(this.ide.rootPath, 'falang/svg', ...relativePathArray, `${fileBaseName}.svg`);
    const exportHtmlName = await this.frontRoot.fs.resolvePath(this.ide.rootPath, 'falang/svg', ...relativePathArray, `${fileBaseName}.html`);
    const scheme = new SchemeStore(this.ide.frontRoot, infrastructure, documentTypeName, this.ide.rootPath, path, this.ide.projectStore);
    runInAction(() => {
      const icon = scheme.createIconFromDto(documentDto.root, null);
      scheme.setRoot(icon);
      scheme.sheduleCallback.flush();
      this.exportSchemeStore = scheme;
    });
    if (!scheme) throw new Error('Should be scheme here');
    await new Promise((resolve) => setTimeout(resolve, 25));
    let svgData = document.getElementById('exportSchemeComponent')?.firstElementChild?.firstElementChild?.outerHTML
    const root = scheme.root;
    if (!svgData || !root) return;
    svgData = svgData.replace(/g transform="[^"]*"/, 'g');
    const left = -root.shape.leftSize - 10;
    const shapeLeft = -root.shape.leftSize - CELL_SIZE;
    const top = -10;
    const width = root.shape.rightSize + root.shape.leftSize + 20;
    const height = root.shape.height + 20;
    scheme.dispose();
    svgData = svgData.replace("<svg", `<svg viewBox='${left} ${top} ${width} ${height}'`);
    svgData = svgData.replace('<rect width="100%" height="100%" x="0" y="0" fill="url(#star)">', `<rect width="${width + CELL_SIZE * 2}" height="${height + CELL_SIZE * 2}" x="${shapeLeft}" y="${-CELL_SIZE}" fill="url(#star)">`);
    const svgFilesvgData = svgData.replace('>', `><style>${this.cssContents}</style><rect x='${left}' y='${top}' width='${width}' height='${height}' fill='#C0E0E8'></rect>`);
    const htmlFilesvgData = svgData.replace('>', `><rect x='${left}' y='${top}' width='${width}' height='${height}' fill='#C0E0E8'></rect>`);
    await this.frontRoot.fs.saveFile(exportSvgName, svgFilesvgData);
    const htmlContents = `<!DOCTYPE html><html><head><style>${this.cssContents}</style></head><body>${htmlFilesvgData}</body></html>`;
    await this.frontRoot.fs.saveFile(exportHtmlName, htmlContents);
  }

  private async getSchemesRoot(): Promise<string> {
    const rootPath = await this.frontRoot.getRootPath();
    const fs = this.frontRoot.fs;
    return  await fs.resolvePath(rootPath, 'falang/schemas');
  }

  private async getSchemeRelativePathArray(path: string): Promise<string[]> {
    const fs = this.frontRoot.fs;
    const schemeRoot = await this.getSchemesRoot();
    if(false === path.startsWith(schemeRoot)) {
      throw new Error(`path ${path} should start with ${schemeRoot}`);
    }
    const relativePath = await fs.relativePath(schemeRoot, path.replace('.falang.json', ''));
    return relativePath.split(/[\/\\]/).filter(item => item !== '.');
  }

  onProjectMenuClicked(text: string) {
    const cb = this.callbacksByMenuText.get(text);
    if (cb) cb();
  }

  onProjectSettingsClicked() {
    this.ide.showSettings();
  }

  private async initialize() {
    const config = await this.config.readConfig();

    if (!config.language) {
      this.ide.dialogs.selectLanguage.show();
      const language = await this.ide.dialogs.selectLanguage.waitForResponse();
      this.frontRoot.lang.setLang(language);
      await this.config.setLang(language);
      this.mainApi.methods.setLang(language);
    } else {
      await this.config.setLang(config.language);
      this.mainApi.methods.setLang(config.language);
    }
    if (config.lastOpenedProjectPath) {
      await this.ide.loadProject(config.lastOpenedProjectPath);
    }
  }
  /*
  async loadDirectory(path: string): Promise<IDirectory> {
    const result = await this.mainApi.fs.loadDirectory(path);
    return result;
  }

  async loadFile(path: string): Promise<string> {
    return this.mainApi.loadFile(path);
  }

  async saveFile(path: string, contents: string): Promise<void> {
    return this.mainApi.saveFile({
      filePath: path,
      contents,
    });
  }

  run(): void {

  }

  showMenu(menu: IContextMenuItem[]): void {
    showMenu(menu);
  }

  onOpenFile(files: IFile[]) {
  }

  onNewFile() {
    this.ide.newFile();
  }*/

  private subscribeToEvents() {
    /*this.mainApi.onOpenFile((e, files: IFile[]) => {
      this.onOpenFile(files);
    });*/
    /*this.mainApi.onOpenDirectory((e, directoryPath: string) => {
      this.onOpenDirectory(directoryPath);
    });*/
    //console.log('subscribe', this.mainApi.events);
    this.mainApi.events.onSave(async () => {
      this.ide.saveActiveTab();
      /*const activeTab = this.ide.activeTab;
      if (!activeTab || !(activeTab instanceof ProjectSchemeEditorTabStore)) return;
      const filePath = activeTab.path;
      await this.mainApi.fs.saveFile(filePath, activeTab.getFileContents());
      runInAction(() => {
        if (!activeTab.path) {
          activeTab.path = filePath;
        }
        activeTab.modified = false;
      })*/
      /*const codeLanguage = this.ide.language;
      if (activeTab instanceof ProjectSchemeEditorTabStore
        && codeLanguage !== 'text'
        && filePath.includes('falang')
        && filePath.includes('schemas')
      ) {
        const codeFilePath = filePath
          .replace('/falang/schemas/', '/falang/_generated_/code/')
          .replace('\\falang\\schemas\\', '\\falang\\_generated_\\code\\')
          .replace(FILE_EXTENSION, LanguageExtendsions[codeLanguage]);

        const codeDirPath = await this.dirname(codeFilePath);
        const code = generateCode(activeTab.editor.root, codeLanguage);
        const dirExists = await this.fileExists(codeDirPath);
        if (!dirExists) {
          await this.createDirectory(codeDirPath);
        }
        await this.saveFile(codeFilePath, code);
        this.ide.type.afterFileSaved(codeFilePath);
      }*/
    });
    /*this.mainApi.onNewFile(() => {
      this.ide.onMenuNewFileClicked();      
    });*/
    this.mainApi.events.onNewProject(() => {
      this.ide.dialogs.newProjectDialog.show();
    });
    this.mainApi.events.onOpenProject(async (e: any, path: string) => {
      if (await this.ide.loadProject(path)) {
        this.mainApi.fs.writeConfig({
          lastOpenedProjectPath: undefined,
        });
      }
    });
    this.mainApi.events.onBack(() => {
      this.ide.goBack();
    });
    this.mainApi.events.onForward(() => {
      this.ide.goForward();
    });
    this.mainApi.events.onWindowClose(async () => {
      //console.log('onWindowClose');
      const canClose = await this.ide.closeAllTabs();
      if (!canClose) return;
      this.mainApi.methods.closeWindow();
    });
    this.mainApi.events.onProjectMenuClicked((e: any, text: string) => {
      this.onProjectMenuClicked(text);
    });
    this.mainApi.events.onProjectSettingsClicked(() => {
      this.onProjectSettingsClicked();
    });
    this.mainApi.events.onAboutClicked(() => {
      runInAction(() => this.aboutModalVisible = true);
    });
    this.mainApi.events.onDocsClicked(() => {
      window.open(`https://falang.io/${this.config.lang}/docs/`);
    });

  }

  /*resolvePath(...args: string[]): Promise<string> {
    return this.mainApi.resolvePath(args);
  }

  async createDirectory(path: string): Promise<void> {
    return this.mainApi.createDirectory(path);
  }
  async deleteDirectory(path: string): Promise<void> {
    return this.mainApi.deleteDirectory(path);
  }
  async deleteFile(path: string): Promise<void> {
    return this.mainApi.deleteFile(path);
  }
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    return this.mainApi.moveFile(oldPath, newPath);
  }
  async getAppPath(name: 'home' | 'appData' | 'userData' | 'sessionData' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'): Promise<string> {
    return this.mainApi.getAppPath(name);
  }
  async openDirectory(defaultValue?: string) {
    return this.mainApi.openDirectory(defaultValue);
  }
  async fileExists(path: string): Promise<boolean> {
    return this.mainApi.fileExists(path);
  }

  readConfig(): Promise<IAppConfig> {
    return this.config.readConfig();
  }
  writeConfig(config: IAppConfig): Promise<void> {
    return this.config.writeConfig(config);
  }
  async setLang(lang: TLanguage): Promise<void> {
    await this.mainApi.setLang(lang);
    await this.writeConfig({ lang });
  }
  dirname(path: string): Promise<string> {
    return this.mainApi.dirname(path);
  }
  basename(path: string): Promise<string> {
    return this.mainApi.basename(path);
  }
  copyEmptyProject(type: string, path: string): Promise<void> {
    return this.mainApi.copyEmptyProject(type, path);
  }*/
}
