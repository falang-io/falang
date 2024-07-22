import { IAppConfig } from '@falang/project';
import { IDirectory, ILinkInfo } from '@falang/frontend-core';

export interface IFileSystemService {
  loadDirectory(path: string): Promise<IDirectory>;
  loadFile(path: string): Promise<string>;
  saveFile(path: string, contents: string): Promise<void>;
  resolvePath(...args: string[]): Promise<string>;
  createDirectory(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  getAppPath(name: 'home' | 'appData' | 'userData' | 'sessionData' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
  openDirectory(defaultValue?: string): Promise<string | null>;
  basename(path: string): Promise<string>;
  dirname(path: string): Promise<string>;
  readConfig(): Promise<IAppConfig>;
  writeConfig(config: IAppConfig): Promise<void>;
  copyEmptyProject(type: string, path: string): Promise<void>
  copyDirectory(from: string, to: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>  
  getLinksOptions: (projectRoot: string) => Promise<ILinkInfo[]>
  getLinkInfo: (projectRoot: string, id: string) => Promise<ILinkInfo>
}
