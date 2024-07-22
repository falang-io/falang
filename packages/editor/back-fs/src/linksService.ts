import { ILinkInfo } from '@falang/frontend-core';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileExists } from './fs';


export const getLinkInfo = async (projectRoot: string, id: string): Promise<ILinkInfo> => {
  const options = await getLinksOptions(projectRoot);
  const item = options.find((option) => option.id === id);
  if(!item) {
    throw new Error(`Scheme #${id} not found`);
  }
  return item;
}

const regenerateFilesListCache = async (projectRoot: string): Promise<ILinkInfo[]> => {
  const schemasDir = path.join(projectRoot, 'falang/schemas');
  const tempDir = path.join(projectRoot, 'falang/temp');
  if (!(await fileExists(schemasDir))) {
    throw new Error('Schemas directory not found');
  }
  if (!(await fileExists(tempDir))) {
    await fs.mkdir(tempDir);
  }
  const filesListCachePath = path.join(tempDir, 'filesList.json');
  const links = await scanDir(schemasDir);
  await fs.writeFile(filesListCachePath, JSON.stringify(links));
  //console.log('links', links);
  return links;
}

export const getLinksOptions = async (projectRoot: string): Promise<ILinkInfo[]> => {
  /*const filesListCachePath = path.join(projectRoot, 'falang/temp/filesList.json');
  if(await fileExists(filesListCachePath)) {
    return JSON.parse((await fs.readFile(filesListCachePath)).toString());
  }*/
  return regenerateFilesListCache(projectRoot);
}

const scanDir = async (directory: string): Promise<ILinkInfo[]> => {
  //console.log('scan', directory);
  const dirContents = await fs.readdir(directory);
  const returnValue: ILinkInfo[] = [];
  for (const filename of dirContents) {
    const filePath = path.join(directory, filename);
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      returnValue.push(...(await scanDir(filePath)));
      continue;
    }
    if (filePath.endsWith('.falang.json')) {
      try {
        const contents = JSON.parse((await fs.readFile(filePath)).toString());
        returnValue.push({
          id: contents.id,
          path: filePath,
          text: contents.name,
          color: contents.root?.block?.color ?? "#ffffff",
        });
      } catch (err) {
        console.error(err);
      }
    }
  }
  return returnValue;
}