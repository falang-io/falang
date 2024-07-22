import { IFileSystemService } from '@falang/frontend-core';
import {ISchemeDto } from '@falang/editor-scheme';
import { IDirectory, IFile, ILinkInfo } from '@falang/frontend-core';
import { IAppConfig } from '@falang/project';
import { app, BrowserWindow, dialog } from 'electron';

import { promises as fs } from 'fs';
import * as path from 'path';
import { FILE_EXTENSION } from '../common/constants';
import { 
  copyFilesToEmptyProject,
  FileSystemService as CoreFileSystemService, myFileExists,
} from '@falang/back-fs';

export class FileSystemService extends CoreFileSystemService {
  constructor(readonly win?: BrowserWindow) { 
    super();
  }

  copyEmptyProject = async (type: string, filePath: string): Promise<void> => {
    await copyFilesToEmptyProject(type, filePath);
  }
  getAppPath = async (name: 'home' | 'appData' | 'userData' | 'sessionData' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'): Promise<string> => {
    return app.getPath(name);
  }
  openDirectory = async (defaultValue?: string): Promise<string | null> => {
    if (!this.win) return null;
    const result = await dialog.showOpenDialog(this.win, {
      properties: ['createDirectory', 'openDirectory'],
      defaultPath: defaultValue,
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    return result.filePaths[0];
  }
  readConfig = async (): Promise<IAppConfig> => {
    const filePath = await getConfigFilePath();
    return JSON.parse((await fs.readFile(filePath)).toString());
  }
  writeConfig = async (config: IAppConfig): Promise<void> => {
    const filePath = await getConfigFilePath();
    await fs.writeFile(filePath, JSON.stringify(config, undefined, 2));
  }
}

const myIsDirectory = async (dir: string) => {
  const stat = await fs.stat(dir);
  return stat.isDirectory();
}

const loadDirectory = async (directory: string): Promise<IDirectory> => {
  const contents = await fs.readdir(directory);
  const returnValue: IDirectory = {
    name: path.basename(directory),
    path: directory,
    directories: [],
    files: [],
  };
  for (const fileName of contents) {
    const filePath = path.join(directory, fileName);
    const isDirectory = await myIsDirectory(filePath);
    if (isDirectory) {
      returnValue.directories.push(await loadDirectory(filePath));
    } else if (fileName.endsWith(FILE_EXTENSION)) {
      const fileInfo = await getIdeFileInfo(filePath);
      returnValue.files.push(fileInfo);
    }
  }
  return returnValue;
}

const getIdeFileInfo = async (filePath: string): Promise<IFile> => {
  const fileName = path.basename(filePath);
  const fileContents = (await fs.readFile(filePath)).toString();
  const fileData = JSON.parse(fileContents) as ISchemeDto;
  return {
    name: fileName.replace(`.${FILE_EXTENSION}`, ''),
    path: filePath,
    type: fileData.type,
    id: fileData.id,
  };
}

export const getConfigDir = async (): Promise<string> => {
  const configPath = path.resolve(app.getPath('userData'), 'Falang');
  const isExists = await myFileExists(configPath);
  if (!isExists) {
    await fs.mkdir(configPath);
  }
  return configPath;
}

export const getConfigFilePath = async (): Promise<string> => {
  const configDir = await getConfigDir();
  return path.resolve(configDir, 'config.json');
}

export const getCustomConfigFilePath = async (name: string): Promise<string> => {
  const configDir = await getConfigDir();
  return path.resolve(configDir, `${name}.json`);
}