import { FrontRootStore, IContextMenuItem, IFile } from '@falang/frontend-core';
import React from 'react';
import { EmptyProjectSettingsComponent } from '../cmp/EmptyProjectSettings.cmp';
import { SchemeStore } from '../store/Scheme.store';
import { IValencePointsRegisterItem } from '../store/ValencePointsRegisterer.store';

export abstract class ProjectStore {
  constructor(readonly frontRoot: FrontRootStore) { }
  afterFileSaved(path: string, scheme: SchemeStore) { }
  validateSchemeName(name: string): void { }
  async init(): Promise<void> { };
  abstract dispose(): void;
  async generateCode(): Promise<void> { }
  onValencePointClick: ((vp: IValencePointsRegisterItem, scheme: SchemeStore) => boolean) | null = null
  getSettingsComponent(): React.FC<{ project: any }> {
    return EmptyProjectSettingsComponent;
  }
  getMenu(): IContextMenuItem[] {
    return [];
  }


  private schemesRoot: string | null = null;

  async getSchemesRoot(): Promise<string> {
    if (this.schemesRoot) return this.schemesRoot;
    const rootPath = await this.frontRoot.getRootPath();
    const fs = this.frontRoot.fs;
    const returnValue = await fs.resolvePath(rootPath, 'falang/schemas');
    this.schemesRoot = returnValue;
    return returnValue;
  }

  async getSchemeRelativePathArray(path: string): Promise<string[]> {
    const fs = this.frontRoot.fs;
    const schemeRoot = await this.getSchemesRoot();
    if (false === path.startsWith(schemeRoot)) {
      throw new Error(`path ${path} should start with ${schemeRoot}`);
    }
    const relativePath = await fs.relativePath(schemeRoot, path.replace('.falang.json', ''));
    return relativePath.split(/[\/\\]/).filter(item => item !== '.');
  }

  async saveConfigFile(name: string, data: any) {
    const configPath = await this.getConfigPath(name);
    await this.frontRoot.fs.saveFile(configPath, JSON.stringify(data, undefined, 2));
  }

  async readConfigFile<T>(name: string): Promise<T | null> {
    const configPath = await this.getConfigPath(name);
    const fs = this.frontRoot.fs;
    if (!(await fs.fileExists(configPath))) {
      return null;
    }
    const contents = await fs.loadFile(configPath);
    return JSON.parse(contents);
  }

  protected async getConfigPath(name: string): Promise<string> {
    const rootPath = await this.frontRoot.getRootPath();
    const fs = this.frontRoot.fs;
    const targetFilePath = await fs.resolvePath(rootPath, 'falang/config', `${name}.json`);
    const dirname = await fs.dirname(targetFilePath);
    if (!(await fs.fileExists(dirname))) {
      await fs.createDirectory(dirname);
    }
    return targetFilePath;
  }

  async beforeSettingsOpened(): Promise<void> { }
  async cancelSettings(): Promise<void> { }
  async saveSettings(): Promise<void> { }

}
