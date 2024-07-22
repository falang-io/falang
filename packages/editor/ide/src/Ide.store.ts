import { IconName } from '@blueprintjs/core';
import { projectTypes, TProjectTypeName } from '@falang/infrastructures-all';
import { ProjectType } from '@falang/editor-scheme';
import { ProjectStore } from '@falang/editor-scheme';
import { FrontRootStore, IContextMenuItem } from '@falang/frontend-core';
import { TLanguage } from '@falang/i18n';
import { action, computed, makeObservable, observable, reaction, runInAction } from 'mobx';
import { FILE_EXTENSION, PROJECT_EXTENSION } from './constants';
import { DialogsState } from './dialogs/DialogsState';
import { IFileSystemService } from '@falang/frontend-core';
import { convertProjectToLatestVersion } from './project-converters/convert_project_to_latest_version';
import { CURRENT_PROJECT_VERSION, ProjectConfigDto } from './project/ProjectConfig.dto';
import { ProjectFilesService } from './services/ProjectFiles.service';
import { SideBarStore } from './sidebar/SideBar.store';
import { IdeDirectoryStore } from './store/IdeDirectories.store';
import { ProjectSchemeEditorTabStore } from './store/tabs/SchemeEditorTab.store';
import { TabStore } from './store/tabs/Tab.store';

export interface IIdeStoreParams {
  fileSystem: IFileSystemService
  frontRoot: FrontRootStore
  readonly?: boolean
}

export const ActivitiesTabIds = [
  'explorer',
  'instruments',
] as const;

export const ActivitiesTabIcons: Record<TActivitiesTabName, IconName> = {
  explorer: 'application',
  instruments: 'shapes',
}

export type TActivitiesTabName = typeof ActivitiesTabIds[number];

const defaultIconBackgroundColor = '#ffffff';
const defaultEditorBackgroundColor = '#cfd8dc';

export class IdeStore {
  @observable name = '';
  @observable.ref projectType: ProjectType | null = null;
  @observable projectTypeName: TProjectTypeName = 'text';
  @observable rootPath = '';
  @observable defaultIconBackground = defaultIconBackgroundColor;
  @observable backgroundColor = defaultEditorBackgroundColor;
  @observable selectedActivityTab: TActivitiesTabName = 'explorer';
  @observable private _isEditing = true;
  @observable private _isEnumerator = false;
  @observable language: TLanguage = 'en';
  @observable private _gapControlsEnabled = false;
  @observable private _projectStore: ProjectStore | null = null;
  @observable private _settingsVisible = false;

  private configSaving = false;
  private configChanged = false;
  readonly readonly: boolean;

  readonly tabs = observable<TabStore>([]);
  @observable activeTabIndex = 0;
  readonly openedDirectoriesPaths = observable<string>([]);
  readonly frontRoot: FrontRootStore
  readonly fileSystem: IFileSystemService
  readonly filesService = new ProjectFilesService(this);
  readonly dialogs = new DialogsState(this);
  readonly rootDirectory = new IdeDirectoryStore();
  readonly sideBar = new SideBarStore(this);
  private projectConfig: ProjectConfigDto | null = null

  constructor({ fileSystem, frontRoot, readonly }: IIdeStoreParams) {
    this.frontRoot = frontRoot;
    this.fileSystem = fileSystem;
    makeObservable(this);
    reaction<IContextMenuItem[]>(
      () => this.projectMenu,
      (menu) => this.frontRoot.setProjectMenu(menu),
    );
    this.readonly = typeof readonly === 'boolean' ? readonly : false;
  }

  @computed get projectStore(): ProjectStore | null {
    return this._projectStore;
  }

  get isEditing(): boolean {
    return this._isEditing;
  }

  @action setIsEditing(editing: boolean) {
    this._isEditing = editing;
    this.tabs.forEach((tab) => {
      if (tab instanceof ProjectSchemeEditorTabStore) {
        tab.scheme.setMode(editing ? 'edit' : 'view');
      }
    });
    if(editing) {
      this.setIsEnumerator(false);
    }
  }

  get isEnumerator() {
    return this._isEnumerator;
  }

  @action setIsEnumerator(isEnumerator: boolean) {
    this._isEnumerator = isEnumerator;
    if(this._isEditing && isEnumerator) {
      this.setIsEditing(false);
    }
    this.tabs.forEach((tab) => {
      if (tab instanceof ProjectSchemeEditorTabStore) {
        tab.scheme.enumeratorStore.setEnabled(isEnumerator);
      }
    });
  }

  @computed get projectMenu(): IContextMenuItem[] {
    return this.projectStore?.getMenu() ?? [];
  }

  async saveActiveTab() {
    const activeTab = this.activeTab;
    if (!activeTab) return;
    await this.saveTab(activeTab);
  }

  private async saveTab(tab: TabStore) {
    if (tab instanceof ProjectSchemeEditorTabStore) {
      await this.saveSchemeEditorTab(tab);
    }
  }

  @action goBack() {
    this.activeTab?.goBack();
  }

  @action goForward() {
    this.activeTab?.goForward();
  }

  async saveSchemeEditorTab(tab: ProjectSchemeEditorTabStore) {
    try {
      await this.fileSystem.saveFile(tab.path, JSON.stringify(tab.scheme.toDto(), undefined, 2));
      tab.onSave();
    } catch (err) {
      const message = this.frontRoot.lang.t(`Unable to save file`);
      const errMessage = err instanceof Error ? err.message : JSON.stringify(err);
      console.error(err);
      this.frontRoot.toaster.show({
        message: `${message}: ${errMessage}`,
        intent: 'danger'
      });
    }

    const config = tab.scheme.infrastructure.config;
    const generateCode = config.generateCode;

    if (generateCode && tab.path.includes('falang') && tab.path.includes('schemas')) {
      const codeFilePath = tab.path
        .replace('/falang/schemas/', '/falang/_generated_/code/')
        .replace('\\falang\\schemas\\', '\\falang\\_generated_\\code\\')
        .replace(FILE_EXTENSION, config.codeExtension ?? 'txt');

      const codeDirPath = await this.fileSystem.dirname(codeFilePath);
      const code = generateCode(tab.scheme.root);
      const dirExists = await this.fileSystem.fileExists(codeDirPath);
      if (!dirExists) {
        await this.fileSystem.createDirectory(codeDirPath);
      }
      await this.fileSystem.saveFile(codeFilePath, code);      
      tab.scheme.infrastructure.afterFileSaved(tab.scheme.root, codeFilePath);
    }
    this.projectStore?.afterFileSaved(tab.path, tab.scheme);
  }

  @computed get hasChangedTab() {
    let returnValue = false;
    this.tabs.forEach((tab) => returnValue ||= tab.modified);
    return returnValue;
  }

  async saveAll() {
    const modifiedTabs = this.tabs.filter((tab) => tab.modified);
    for (const tab of modifiedTabs) {
      await this.saveTab(tab);
    }
  }

  @computed get activeTab(): TabStore | null {
    const activeTab = this.tabs[this.activeTabIndex];
    if (!activeTab) return null;
    return activeTab;
  }



  getConfigFilePath(directory: string): Promise<string> {
    return this.fileSystem.resolvePath(directory, `project.${PROJECT_EXTENSION}`)
  }

  async getSchemasDirectory(rootDirectory: string) {
    return this.fileSystem.resolvePath(rootDirectory, `falang/schemas`)
  }

  async loadProject(directory: string): Promise<boolean> {
    const configPath = await this.getConfigFilePath(directory);
    let projectConfig: ProjectConfigDto = JSON.parse(await this.fileSystem.loadFile(configPath));
    if(projectConfig.version !== CURRENT_PROJECT_VERSION) {
      try {
        projectConfig = await convertProjectToLatestVersion(projectConfig, directory, this);
      } catch (err) {
        console.error(err);
        this.frontRoot.toaster.show({
          message: `${this.frontRoot.lang.t('app:error_while_migrating')}: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
          intent: 'danger',
        });
        return false;
      }
      this.frontRoot.toaster.show({
        message: `${this.frontRoot.lang.t('app:success_migration_to_version')}: ${CURRENT_PROJECT_VERSION}`,
        intent: 'success',
      });
    }
    if (!(await this.closeAllTabs())) {
      return false;
    }
    runInAction(() => {      
      this.rootPath = directory;
      this.projectConfig = projectConfig;
      this.projectType = projectTypes[projectConfig.type];
      this._projectStore = this.projectType.createProjectStore(this.frontRoot);
      
      this.projectTypeName = projectConfig.type;
      this.defaultIconBackground = projectConfig.defaultIconBackground ?? defaultIconBackgroundColor;
      this.backgroundColor = projectConfig.schemeBackground ?? defaultEditorBackgroundColor;
      this.name = projectConfig.name;
    });
    const schemasDirectory = await this.getSchemasDirectory(directory);
    const loadedDirectory = await this.fileSystem.loadDirectory(schemasDirectory);
    const firstFile = loadedDirectory.files[0];
    if (!!firstFile) {
      this.filesService.loadFile(firstFile.path);
    }
    await this.filesService.reloadDirectories();    
    if(this.projectStore) {
      await this.projectStore.init();
    }
    return true;
  }

  async closeAllTabs(): Promise<boolean> {
    const t = this.frontRoot.lang.t;
    if (this.hasChangedTab) {
      const result = await this.yesNoCancel(t('save-opened-files'));
      if (result === null) {
        return false;
      }
      if (result === 'yes') {
        await this.saveAll();
      }
    }
    const tabs = this.tabs.slice();
    runInAction(() => {
      this.tabs.clear();
      tabs.forEach(tab => tab.dispose());
    });

    return true;
  }

  async closeTab(index: number): Promise<boolean> {
    const t = this.frontRoot.lang.t;
    const tab = this.tabs[index];
    if (!tab) return true;
    if (tab.modified) {
      const result = await this.yesNoCancel(t('save-opened-files'));
      if (result === null) {
        return false;
      }
      if (result === 'yes') {
        await this.saveAll();
      }
    }
    this.tabs.splice(index, 1);
    tab.dispose();
    return true;
  }

  async yesNoCancel(text: string): Promise<'yes' | 'no' | null> {
    const t = this.frontRoot.lang.t;
    const result = await this.frontRoot.messageBox.show({
      text,
      buttons: [
        t('base:yes'),
        t('base:no'),
        t('base:cancel'),
      ]
    });
    switch (result) {
      case 0: return 'yes';
      case 1: return 'no';
    }
    return null;
  }

  async updateConfig(config?: Partial<ProjectConfigDto>) {
    if (!this.projectConfig) return;
    const newConfig: ProjectConfigDto = {
      ...this.projectConfig,
      ...config,
    };
    runInAction(() => {
      if (!this.projectConfig) return;
      this.projectConfig = newConfig;
    });
    if (this.configSaving) {
      this.configChanged = true;
      return;
    }
    await this.saveConfig();
    if (this.configChanged) {
      this.configChanged = false;
      await this.updateConfig();
    }
    if (config?.defaultIconBackground) {
      this.updateDefaultIconBackground(config.defaultIconBackground);
    }
    if (config?.schemeBackground) {
      this.updateSchemeBackground(config.schemeBackground);
    }
  }

  async saveConfig() {
    const filePath = await this.getConfigFilePath(this.rootPath);
    await this.fileSystem.saveFile(filePath, JSON.stringify(this.projectConfig, undefined, 2));
  }

  async getConfig(): Promise<ProjectConfigDto> {
    const configPath = await this.getConfigFilePath(this.rootPath);
    return JSON.parse(await this.fileSystem.loadFile(configPath));
  }

  private updateDefaultIconBackground(color: string) {
    this.tabs.map(tab => {
      if (tab instanceof ProjectSchemeEditorTabStore) {
        tab.scheme.defaultIconBackgroundColor = color;
      }
    })
  }

  private getSchemeEditorTabs(): ProjectSchemeEditorTabStore[] {
    const returnValue: ProjectSchemeEditorTabStore[] = [];
    this.tabs.forEach(tab => {
      if (tab instanceof ProjectSchemeEditorTabStore) {
        returnValue.push(tab);
      }
    })
    return returnValue;
  }

  private updateSchemeBackground(color: string) {
    this.tabs.map(tab => {
      if (tab instanceof ProjectSchemeEditorTabStore) {
        tab.scheme.editorBackgroundColor = color;
      }
    })
  }

  dispose() {
    this.closeAllTabs();
  }

  getFileIndex(id: string): number {
    return this.tabs.findIndex((tab) => tab.id === id);
  }

  @computed get selectedFilePath(): string | null {
    const tab = this.activeTab;
    if (!tab) return null;
    return tab.path;
  }

  @action setActivityTabName(name: TActivitiesTabName) {
    this.selectedActivityTab = name;
  }

  @action onMouseMove(e: React.MouseEvent<any, any>) {
    this.sideBar.mouseMove(e);
  }

  @action onMouseUp(e: React.MouseEvent<any, any>) {
    this.sideBar.mouseUp();
  }

  get gapControlsEnabled() {
    return this._gapControlsEnabled;
  }

  @action setGapControlsEnabled(enabled: boolean) {
    this._gapControlsEnabled = enabled;
    this.getSchemeEditorTabs().forEach((tab) => {
      tab.scheme.gapModify.setEnabled(enabled);
    });
  }

  getSchemasTabs(): ProjectSchemeEditorTabStore[] {
    return this.tabs.filter(tab => tab instanceof ProjectSchemeEditorTabStore) as  ProjectSchemeEditorTabStore[];
  }

  get settingsVisible() {
    return this._settingsVisible;
  }

  @action showSettings() {
    const projectStore = this.projectStore;
    const t = this.frontRoot.lang.t;
    if(!projectStore) {
      this.frontRoot.toaster.show({
        message: t('ide:project_type_have_no_settings')
      });
      return;
    }
    projectStore.beforeSettingsOpened();
    this._settingsVisible = true;
  }

  @action cancelSettings() {
    const projectStore = this.projectStore;
    this._settingsVisible = false;
    if(!projectStore) return;
    projectStore.cancelSettings();
  }

  @action saveSettings() {
    const projectStore = this.projectStore;
    this._settingsVisible = false;
    if(!projectStore) return;
    projectStore.saveSettings().catch((err) => {
      const t = this.frontRoot.lang.t;
      this.frontRoot.toaster.show({
        message: `${t('base:error')}: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
        intent: 'danger'
      });
    });
  }
}