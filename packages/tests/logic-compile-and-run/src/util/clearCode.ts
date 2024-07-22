import * as fs from 'fs';
import * as path from 'path';
import { projectRootDirName } from '../constants';
const dirsToCheck = ['src/falang', 'falang', 'src/Falang'];

export const clearCode = () => {
  const projectsDirNames = fs.readdirSync(projectRootDirName);
  for (const projectDirName of projectsDirNames) {
    const projectCodeDir = path.resolve(projectRootDirName, projectDirName, 'code');
    const codeDirs = fs.readdirSync(projectCodeDir);
    for(const codeDir of codeDirs) {
      for (const dirToCheck of dirsToCheck) {
        const dir = path.resolve(projectCodeDir, codeDir, dirToCheck);
        if (!fs.existsSync(dir)) continue;
        console.log('rm', dir);
        fs.rmSync(dir, { recursive: true, force: true });
      }

    }

  }
}