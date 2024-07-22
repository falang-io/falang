import 'reflect-metadata';
import * as fs from 'fs';
import { projectRootDirName } from '../constants';
import { buidProject } from '../util/buildProject';
import { clearCode } from '../util/clearCode';

const main = async () => {
  const projectsDirNames = fs.readdirSync(projectRootDirName);
  clearCode();
  for(const projectName of projectsDirNames) {
    await buidProject(projectName);
  }
}

main();
