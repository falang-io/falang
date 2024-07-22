//console.log('my preload script')

import { IContextMenuItem } from '@falang/frontend-core';
import { TLanguage } from '@falang/i18n';
import { AnyRecord } from 'dns';
import { contextBridge, ipcRenderer } from 'electron';
import { MenuItemConstructorOptions } from 'electron';
import { MainService } from './Main.service';

export type Channels = 'ipc-example';

const mainService = new MainService();
const addToInvoke = (item: Record<string, any>, prefix = '') => {
  if (typeof item !== 'object') {
    console.warn('Wrong item', item);
    //throw new Error('Wrong item');
  };
  //console.log('addToInvoke', item);
  for (const key in item) {    
    if (key === 'prototype') continue;
    const child = item[key];    
    if (typeof child === 'function') {
      const fullKey = `${prefix}-${key}`;
      console.info('Register preload handler', fullKey);
      item[key] = (...args: any[]) => ipcRenderer.invoke(fullKey, ...args);
    } else if (typeof item === 'object') {
      const newPrefix = prefix.length ? `${prefix}-` : '';
      addToInvoke(item[key], `${newPrefix}${key}`);
    } else {
      console.warn('Bad item in addToHandle:', {
        obj: item
      });
    }
  }
}
addToInvoke(mainService);

const mainServiceEvents = {
  onOpenFile(callback: any) {
    ipcRenderer.on('on-open-file', callback)
  },
  onOpenDirectory(callback: any) {
    ipcRenderer.on('on-open-directory', callback);
  },
  onOpenProject(callback: any) {
    //console.log('register');
    ipcRenderer.on('on-open-project', (...args) => {
      //console.log('invoked');
      callback(...args);  
    });
  },
  onNewFile(callback: any) {
    ipcRenderer.on('on-new-file', callback);
  },
  onNewProject(callback: any) {
    ipcRenderer.on('on-new-project', callback);
  },
  onSave(callback: any) {
    ipcRenderer.on('on-save', callback);
  },
  onBack(callback: any) {
    ipcRenderer.on('on-back', callback);
  },
  onForward(callback: any) {
    ipcRenderer.on('on-forward', callback);
  },
  onWindowClose(callback: any) {
    ipcRenderer.on('on-window-close', callback);
  },
  onProjectMenuClicked(callback: any) {
    ipcRenderer.on('on-project-menu-clicked', callback);
  },
  onProjectSettingsClicked(callback: any) {
    ipcRenderer.on('project-settings-clicked', callback);
  },
  onAboutClicked(callback: any) {
    ipcRenderer.on('onAboutClicked', callback);
  },
  onDocsClicked(callback: any) {
    ipcRenderer.on('onDocsClicked', callback);
  },
}

mainService.events = mainServiceEvents;

const mainServiceMethods = {
  setLang (lang: TLanguage) {
    ipcRenderer.invoke('set-lang', lang);
  },
  setProjectMenu (menu: IContextMenuItem[]): Promise<void> {
    return ipcRenderer.invoke('set-project-menu', menu);
  },
  getClipboard(): Promise<string> {
    return ipcRenderer.invoke('get-clipboard');
  },
  setClipboard(value: string): Promise<void> {
    return ipcRenderer.invoke('set-clipboard', value);
  },
  closeWindow() {
    ipcRenderer.invoke('close-window');
  },
  getVersion(): Promise<string> {
    return ipcRenderer.invoke('get-version');
  },
} as const;

export type TMainServiceMethods = typeof mainServiceMethods;

mainService.methods = mainServiceMethods;

/**  onOpenFile(callback: any) {
    ipcRenderer.on('on-open-file', callback)
  },
  onOpenDirectory(callback: any) {
    ipcRenderer.on('on-open-directory', callback);
  },
  onOpenProject(callback: any) {
    ipcRenderer.on('on-open-project', callback);
  },
  onNewFile(callback: any) {
    ipcRenderer.on('on-new-file', callback);
  },
  onNewProject(callback: any) {
    ipcRenderer.on('on-new-project', callback);
  }, */
/*
const electronHandler = {
  showMenu(options: MenuItemConstructorOptions[]): Promise<string | null> {
    return ipcRenderer.invoke('show-context-menu', options)
  },
  loadDirectory(directory: string) {
    return ipcRenderer.invoke('load-directory', directory);
  },
  loadFile(file: string) {
    return ipcRenderer.invoke('load-file', file);
  },
  saveFile(data: any) {
    return ipcRenderer.invoke('save-file', data);
  },
  openFile() {
    return ipcRenderer.invoke('open-file');
  },
  saveFileDialog() {
    return ipcRenderer.invoke('save-file-dialog');
  },
  openDirectory() {
    return ipcRenderer.invoke('open-directory');
  },
  resolvePath(args: string[]): Promise<string> {
    return ipcRenderer.invoke('resolve-path', args)
  },
  moveFile(oldPath: string, newPath: string): Promise<string> {
    return ipcRenderer.invoke('move-file', oldPath, newPath);
  },
  deleteFile(filePath: string): Promise<void> {
    return ipcRenderer.invoke('delete-file', filePath);
  },
  deleteDirectory(directoryPath: string): Promise<void> {
    return ipcRenderer.invoke('delete-directory', directoryPath);
  },
  createDirectory(directoryPath: string): Promise<void> {
    return ipcRenderer.invoke('create-directory', directoryPath);
  },
  openProject() {
    return ipcRenderer.invoke('open-project');
  },
  onOpenFile(callback: any) {
    ipcRenderer.on('on-open-file', callback)
  },
  onOpenDirectory(callback: any) {
    ipcRenderer.on('on-open-directory', callback);
  },
  onOpenProject(callback: any) {
    ipcRenderer.on('on-open-project', callback);
  },
  onNewFile(callback: any) {
    ipcRenderer.on('on-new-file', callback);
  },
  onNewProject(callback: any) {
    ipcRenderer.on('on-new-project', callback);
  },
  onSave(callback: any) {
    ipcRenderer.on('on-save', callback);
  },
  getAppPath(pathType: string): Promise<string> {
    return ipcRenderer.invoke('get-app-path', pathType);
  },
  fileExists(filePath: string): Promise<boolean> {
    return ipcRenderer.invoke('file-exists', filePath);
  },
  readConfig(): Promise<string> {
    return ipcRenderer.invoke('read-config');
  },
  writeConfig(contents: string): Promise<void> {
    return ipcRenderer.invoke('write-config', contents);
  },
  setLang(lang: string): Promise<void> {
    return ipcRenderer.invoke('set-lang', lang);
  },
  basename(filePath: string): Promise<string> {
    return ipcRenderer.invoke('basename', filePath);
  },
  dirname(filePath: string): Promise<string> {
    return ipcRenderer.invoke('dirname', filePath);
  },
  copyEmptyProject(type: string, path: string): Promise<void> {
    return ipcRenderer.invoke('copy-empty-project', type, path);
  },

};
*/
contextBridge.exposeInMainWorld('electron', mainService);


