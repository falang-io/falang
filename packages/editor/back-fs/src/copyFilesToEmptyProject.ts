import * as path from 'path';
import * as fs from 'fs';
import { resourcesPath } from './resourcesPath';
import { myCopyFile, myCreateDirectory, myFileExists, myIsDirectory, myReadDir, myRename } from './fs';

export const copyDirectory = async (fromPath: string, toPath: string) => {
  if(!fs.existsSync(toPath)) {
    await myCreateDirectory(toPath)
  }
  const dirContents = await myReadDir(fromPath);
  for(const dirItem of dirContents) {
    const itemPath = path.resolve(fromPath, dirItem);
    const toItemPath = path.resolve(toPath, dirItem);
    const isDirectory = await myIsDirectory(itemPath);
    if(isDirectory) {
      await copyDirectory(itemPath, toItemPath);
    } else {
      await myCopyFile(itemPath, toItemPath);
    }
  }
}

export const copyFilesToEmptyProject = async (type: string, destinationPath: string) => {
  let sourceDirectoryPath: string
  if(type.includes('/') || type.includes('\\')) {
    sourceDirectoryPath = path.resolve(resourcesPath, type);
  } else {
    sourceDirectoryPath = path.resolve(resourcesPath, 'empty-projects', type);
  }
  
  const sourceExists = await myFileExists(sourceDirectoryPath);
  if (!sourceExists) {
    throw new Error(`Source ${sourceDirectoryPath} not exists`);
  }
  await copyDirectory(sourceDirectoryPath, destinationPath);
}
