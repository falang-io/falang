import 'reflect-metadata';
import * as fs from 'fs';
import { projectRootDirName } from '../constants';
import { buidProject } from '../util/buildProject';
import { clearCode } from '../util/clearCode';

const main = () => {
  const projectsDirNames = fs.readdirSync(projectRootDirName);
  const selectedProjectName = process.argv[process.argv.length - 1];
  if(!(projectsDirNames.includes(selectedProjectName))) {
    throw new Error(`Wrong project: ${selectedProjectName}, available projects: ${projectsDirNames.join(',')}`);
  }
  clearCode();
  buidProject(selectedProjectName);
}

main();
