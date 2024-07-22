import * as path from 'path';
import * as fs from 'fs';

const findRoot = (dir?: string): string => {
  if (!dir) dir = __dirname;
  if (fs.existsSync(path.resolve(dir, 'package.json'))) return dir;
  const parentDir = path.dirname(dir);
  if(dir === parentDir) throw new Error('Cannot find root');
  return findRoot(parentDir);
}

export const projectRootDirName = path.join(findRoot(), '../../../resources/test-projects');