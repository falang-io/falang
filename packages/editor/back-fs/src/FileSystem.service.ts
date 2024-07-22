import { IFileSystemService } from '@falang/frontend-core';
import { IDirectory, IFile, ILinkInfo } from '@falang/frontend-core';
import { IAppConfig } from '@falang/project';

import { promises as fs } from 'fs';
import * as path from 'path';
import { copyDirectory } from './copyFilesToEmptyProject';
import { fileExists, myWriteFile } from './fs';
import { getLinkInfo, getLinksOptions } from './linksService';
import { resourcesPath } from './resourcesPath';

export const FILE_EXTENSION = 'falang.json';

 interface ISchemeDto {
  schemeVersion: 2
  id: string
  name: string
  description: string
  root: any
  type: string
}

export class FileSystemService implements IFileSystemService {

  basename = async (filePath: string): Promise<string> => {
    return path.basename(filePath)
  }
  copyEmptyProject = async (type: string, filePath: string): Promise<void> => {
    throw new Error('copyEmptyProject not implemented');
    //await copyFilesToEmptyProject(type, filePath);
  }
  createDirectory = async (filePath: string): Promise<void> => {
    await fs.mkdir(filePath, { recursive: true });
  }
  deleteDirectory = async (filePath: string): Promise<void> => {
    await fs.rmdir(filePath);
  }
  deleteFile = async (filePath: string): Promise<void> => {
    await fs.unlink(filePath);
  }
  dirname = async (filePath: string): Promise<string> => {
    return path.dirname(filePath);
  }
  fileExists = fileExists;
  getAppPath = async (name: 'home' | 'appData' | 'userData' | 'sessionData' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'): Promise<string> => {
    throw new Error('did not run inside electron');
  }
  loadDirectory = async (filePath: string): Promise<IDirectory> => {
    return loadDirectory(filePath);
  }
  loadFile = async (filePath: string): Promise<string> => {
    return (await fs.readFile(filePath)).toString()
  }
  openDirectory = async (defaultValue?: string): Promise<string | null> => {
    throw new Error('Not runned inside electron');
  }
  renameFile = async (oldPath: string, newPath: string): Promise<void> => {
    await fs.rename(oldPath, newPath);
  }
  resolvePath = async (...args: string[]): Promise<string> => {
    return path.resolve(...args);
  }
  saveFile = async (filePath: string, contents: string): Promise<void> => {
    if(!await fileExists(path.dirname(filePath))) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }
    await myWriteFile(filePath, contents);
  }
  readConfig = async (): Promise<IAppConfig> => {
    throw new Error('readConfig not implemented');
  }
  writeConfig = async (config: IAppConfig): Promise<void> => {
    throw new Error('writeConfig not implemented');
  }
  copyDirectory = async(from: string, to: string): Promise<void> => {
    await copyDirectory(from, to);
  }
  copyFile = async(from: string, to: string): Promise<void> => {
    await fs.copyFile(from, to);
  }
  getLinkInfo = getLinkInfo;
  getLinksOptions = getLinksOptions;
  relativePath = async (from: string, to: string): Promise<string> => {
    const returnValue = path.relative(from, to);
    if(returnValue.startsWith('.')) return returnValue;
    return './'.concat(returnValue);
  }
  getResourcesPath = () => Promise.resolve(resourcesPath)
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