import { IFileSystemService } from './IFileSystem.service';
import { ILinkInfo } from './ILinksService';
import { IDirectory } from './ProjectStructure';

export const plugFileSystem: IFileSystemService = {
  loadDirectory: function (path: string): Promise<IDirectory> {
    throw new Error('Function not implemented.');
  },
  loadFile: function (path: string): Promise<string> {
    throw new Error('Function not implemented.');
  },
  saveFile: async function (path: string, contents: string): Promise<void> {
    throw new Error('Not implemented');
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
}