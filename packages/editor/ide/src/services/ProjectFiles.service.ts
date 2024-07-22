import { getDocumentConfig, infrastructures, isProjectTypeName, projectTypes, TProjectTypeName } from '@falang/infrastructures-all';
import { ISchemeDto, SchemeStore } from '@falang/editor-scheme';
import { ProjectType } from '@falang/editor-scheme';
import { runInAction } from 'mobx';
import { nanoid } from 'nanoid';
import { FILE_EXTENSION } from '../constants';
import { IdeStore } from '../Ide.store';
import { ProjectSchemeEditorTabStore } from '../store/tabs/SchemeEditorTab.store';

export class ProjectFilesService {
  constructor( readonly ide: IdeStore) {}

  async createFile(projectTypeName: TProjectTypeName, documentTypeName: string, name: string, path: string) {
    const documentConfig = getDocumentConfig(projectTypeName, documentTypeName);
    if(!(documentConfig.infrastructure in infrastructures)) {
      throw new Error(`Wrong infrastructure: ${documentConfig.infrastructure}`);
    }
    const infrastructure = infrastructures[documentConfig.infrastructure as keyof typeof infrastructures];
    //console.log({documentTypeName, projectTypeName });
    const scheme = new SchemeStore(this.ide.frontRoot, infrastructure, documentTypeName, this.ide.rootPath, path, this.ide.projectStore);
    scheme.id = nanoid();
    scheme.setRoot(documentConfig.createEmpty(scheme));
    const filePath = await this.ide.fileSystem.resolvePath(path, `${name}.${FILE_EXTENSION}`);
    const tab = new ProjectSchemeEditorTabStore(this.ide, scheme, filePath);
    runInAction(() => {
      const activeIndex = this.ide.tabs.length;
      this.ide.tabs.push(tab);
      this.ide.activeTabIndex = activeIndex;
      scheme.name = name;
      scheme.editorBackgroundColor = this.ide.backgroundColor;
    });
    await this.ide.saveSchemeEditorTab(tab);
    this.reloadDirectories();
    runInAction(() => {
      tab.loaded = true;
      tab.scheme.mode = this.ide.isEditing ? 'edit' : 'view';
    })
  }

  async loadFile(path: string) {
    //console.log('Loading file', path);
    let tabFound = false;
    this.ide.tabs.forEach((tab, index) => {
      if(tab.path === path) {
        runInAction(() => {
          this.ide.activeTabIndex = index;
        })
        tabFound = true;
        return false;
      }      
    });
    if(tabFound) return;
    const projectTypeName = this.ide.projectTypeName;
    const document: ISchemeDto = JSON.parse(await this.ide.fileSystem.loadFile(path));
    const documentTypeName = document.type;
    const documentConfig = getDocumentConfig(projectTypeName, documentTypeName);    
    if(!(documentConfig.infrastructure in infrastructures)) {
      throw new Error(`Wrong infrastructure: ${documentConfig.infrastructure}`);
    }
    const infrastructure = infrastructures[documentConfig.infrastructure as keyof typeof infrastructures];
    if(!infrastructure) {
      throw new Error(`Infrastructure not found for ${projectTypeName}/${documentTypeName}`);
    }
    const scheme = new SchemeStore(this.ide.frontRoot, infrastructure, documentTypeName, this.ide.rootPath, path, this.ide.projectStore);
    const icon = scheme.createIconFromDto(document.root, null);
    scheme.setRoot(icon);
    const tab = new ProjectSchemeEditorTabStore(this.ide, scheme, path);    
    runInAction(() => {
      const activeIndex = this.ide.tabs.length;
      this.ide.tabs.push(tab);
      this.ide.activeTabIndex = activeIndex;
      scheme.name = document.name
      scheme.description = document.description;
      scheme.id = document.id;
      tab.scheme.editorBackgroundColor = this.ide.backgroundColor;
      tab.scheme.gapModify.setEnabled(this.ide.gapControlsEnabled);
    });
    setTimeout(() => {
      tab.scheme.sheduleCallback.flush();
      tab.scheme.resetPosition();
      tab.loaded = true;
      tab.scheme.mode = this.ide.isEditing ? 'edit' : 'view';
    }, 5);
    return tab;
  }

  async createProject(type: string, directory: string, name: string) {
    try {
      await this.ide.closeAllTabs();
      let projectType: ProjectType | null = null;
      if(isProjectTypeName(type)) {
        projectType = projectTypes[type];
      } else {
        const resourcesPath = await this.ide.fileSystem.getResourcesPath();
        const projectConfigPath = await this.ide.fileSystem.resolvePath(resourcesPath, type, 'project.falangproject.json');
        const exists = await this.ide.fileSystem.fileExists(projectConfigPath);
        if(!exists) {
          throw new Error(`Project not exists: ${type}`);
        }
        const newProjectTypeName: string = JSON.parse((await this.ide.fileSystem.loadFile(projectConfigPath))).type;
        if(!isProjectTypeName(newProjectTypeName)) {
          throw new Error(`Project type not exists: ${newProjectTypeName}`);
        }
        projectType = projectTypes[newProjectTypeName];
      }
      await this.ide.fileSystem.copyEmptyProject(type, directory);
      runInAction(() => {
        this.ide.projectType = projectType;
        this.ide.rootPath = directory;
      });
      const configFilePath = await this.ide.getConfigFilePath(directory);
      const readmeFilePath = await this.ide.fileSystem.resolvePath(directory, 'README.txt');
      const currentConfig = JSON.parse(await this.ide.fileSystem.loadFile(configFilePath));
      await this.ide.fileSystem.saveFile(configFilePath, JSON.stringify({
        ...currentConfig,
        name,
      }, undefined, 2));
      await this.ide.loadProject(directory);
      if(await this.ide.fileSystem.fileExists(readmeFilePath)) {
        this.ide.frontRoot.messageBox.show({
          text: this.ide.frontRoot.lang.t('base:view_readme'),
          buttons: ["Ok"],
        }); 
      }
    } catch (err) {
      this.ide.frontRoot.toaster.show({
        message: (err as Error).message,
        intent: 'danger',
      });
      console.error(err);
    }

    /**    try {
      const projectType = this.projectTypes[type];
      await this.ide.copyEmptyProject(type, directory);
      await projectType.initEmptyProject({ directory, name });
      runInAction(() => {
        this.currentProjectType = type;
      });
      this.loadProject(directory);
    } catch (err: any) {
      this.root.toaster.show({
        message: err.message,
        intent: 'danger',
      });
      throw err;
    } */
  }

  async moveFile(filePath: string, destDirectory: string) {
    if (destDirectory.indexOf(FILE_EXTENSION) !== -1) {
      destDirectory = await this.ide.fileSystem.dirname(destDirectory);
    }
    if (filePath.indexOf(FILE_EXTENSION) === -1) {
      return;
    }
    const basename = await this.ide.fileSystem.basename(filePath);
    let destPath = await this.ide.fileSystem.resolvePath(destDirectory, basename);
    if (destPath === filePath) return;
    if (await this.ide.fileSystem.fileExists(destPath)) {
      this.ide.frontRoot.toaster.show({
        message: this.ide.frontRoot.lang.t('file:already-exists'),
        intent: 'danger',
      });
    }
    await this.ide.fileSystem.renameFile(filePath, destPath);
    await this.reloadDirectories();
    this.ide.frontRoot.toaster.show({
      message: this.ide.frontRoot.lang.t('file:file-moved'),
      intent: 'success',
      timeout: 1000,
      isCloseButtonShown: false,
    });
    for (const tab of this.ide.tabs) {
      if (tab.path === filePath) {
        runInAction(() => {
          tab.path = destPath;
        })
      }
    }
  }

  async reloadDirectories() {
    if (!this.ide.rootPath) {
      return;
    }
    const path = await this.ide.getSchemasDirectory(this.ide.rootPath);
    const loadedDirectories = await this.ide.fileSystem.loadDirectory(path);
    this.ide.rootDirectory.load(loadedDirectories);
  }
}