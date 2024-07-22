import { PROJECT_EXTENSION } from '../constants';
import { IdeStore } from '../Ide.store';
import { ProjectConfigDto } from '../project/ProjectConfig.dto';
import { convert1to2 } from './convert1to2';

export const convertProjectToLatestVersion = async (config: ProjectConfigDto, path: string, ide: IdeStore) => {
  if(config.version !== 1) {
    throw new Error('Can convert only from 1 version');
  }
  const falangDir = await ide.fileSystem.resolvePath(path, 'falang');
  let backupFalangDir = await ide.fileSystem.resolvePath(path, 'falang_backup');    
  let index = 1;
  while(await ide.fileSystem.fileExists(backupFalangDir)) {
    index++;
    backupFalangDir = await ide.fileSystem.resolvePath(path, `falang_backup${index}`);
  }
  await ide.fileSystem.createDirectory(backupFalangDir);
  const newFalangDir = await ide.fileSystem.resolvePath(backupFalangDir, 'falang');
  await ide.fileSystem.copyDirectory(falangDir, newFalangDir);
  const projectFrom = await ide.fileSystem.resolvePath(path, `project.${PROJECT_EXTENSION}`)
  const projectTo = await ide.fileSystem.resolvePath(backupFalangDir, `project.${PROJECT_EXTENSION}`)
  await ide.fileSystem.copyFile(projectFrom, projectTo);
  return await convert1to2(config, path, ide);
}