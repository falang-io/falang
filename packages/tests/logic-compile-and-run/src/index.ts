import 'reflect-metadata';
import { IdeStore } from '@falang/editor-ide';
import { fakeFrontRoot, fs as frontRootFs, setProjectRoot } from './fakeFrontRoot';
import * as path from 'path';
import * as fs1 from 'fs';
const fs = fs1.promises;
import { checker } from '@falang/editor-scheme';
import { projectRootDirName } from './constants';
import { runners } from './util/runners';
import { clearCode } from './util/clearCode';
import { checkerLogic } from '@falang/infrastructure-logic';

const main = async () => {
  const ide = new IdeStore({
    frontRoot: fakeFrontRoot,
    fileSystem: frontRootFs,
  });

  clearCode();

  const projects = await fs.readdir(projectRootDirName);

  console.log('Reading projects: ', projects.join(', '));

  for (const projectName of projects) {
    const projectPath = path.resolve(projectRootDirName, projectName);
    const resultFilePath = path.resolve(projectPath, 'result.txt');
    if(!fs1.existsSync(resultFilePath)) {
      throw new Error(`Not found result.txt in ${projectPath}`);
    }
    const needResultStrings = (await fs.readFile(path.resolve(projectPath, 'result.txt'))).toString().split('\n');
    setProjectRoot(projectPath);
    console.log('Reading project: ', projectName);
    const loadResult = await ide.loadProject(projectPath);
    if (!loadResult) {
      throw new Error(`Can\`t load project: ${projectPath}`);
    }
    const projectStore = ide.projectStore;
    if (!projectStore) {
      throw new Error('No project store');
    }
    if (!checkerLogic.isLogicProjectStore(projectStore)) {
      throw new Error('Should be logic project store');
    }
    await projectStore.buildCode();
    const codeDir = path.resolve(projectPath, 'code');
    console.log('Code building finished');

    for(const runnerInfo of runners) {
      console.log(`Starting ${runnerInfo.name} for project ${projectName}`);
      const returnStrings = await runnerInfo.handler(codeDir);
      for (let i = 0; i < needResultStrings.length; i++) {
        const need = needResultStrings[i];
        const current = returnStrings[i] || '';
        if (!need.length) continue;
        if (need.endsWith('***') && current.startsWith(need.substring(0, need.length - 3))) continue;
        if (need === current) continue;
        throw new Error(`Test return failed.\nLine: ${i + 1}\nNeed:${needResultStrings[i]}\nGot:${returnStrings[i]}`);
      }      
      console.log(`Passed ${runnerInfo.name} for project ${projectName}`);
    }    
  }
  console.log('Nice! All tests done!');
};

main();
