import * as path from 'path';
import * as fs1 from 'fs';
const fs = fs1.promises;
import { fakeFrontRoot, setProjectRoot } from '../fakeFrontRoot';
import { IdeStore } from '@falang/editor-ide';
import { FileSystemService } from '@falang/back-fs';
import { checker } from '@falang/editor-scheme';
import { projectRootDirName } from '../constants';

export const buidProject = async (projectName: string) => {
  const projectPath = path.resolve(projectRootDirName, projectName);
  await buidProjectFromPath(projectPath);
};

export const buidProjectFromPath = async (projectPath: string) => {
  const ide = new IdeStore({
    frontRoot: fakeFrontRoot,
    fileSystem: new FileSystemService,
  });
  if(!fs1.existsSync(projectPath)) throw new Error(`Project not found: ${projectPath}`);
  setProjectRoot(projectPath);
  console.log('Reading project: ', projectPath);
  const loadResult = await ide.loadProject(projectPath);
  if (!loadResult) {
    throw new Error(`Can\`t load project: ${projectPath}`);
  }
  const projectStore = ide.projectStore;
  if (!projectStore) {
    throw new Error('No project store');
  }
  if (!checker.isLogicProjectStore(projectStore)) {
    throw new Error('Should be logic project store');
  }
  await projectStore.buildCode();
  console.log('Code building finished');
};
