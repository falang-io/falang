import * as path from 'path';
import * as fs from 'fs';

let resourcesPath: string = (process as any).resourcesPath;
if(!resourcesPath || (__filename.endsWith('.js') && process.env.NODE_ENV !== 'production' && !__filename.includes('app.asar'))) {
  resourcesPath = path.resolve(__dirname, '../../../../../resources')
}

if(!fs.existsSync(resourcesPath)) {
  resourcesPath = path.resolve(__dirname, '../../../../resources');
}

if(!fs.existsSync(resourcesPath)) {
  throw new Error(`Cannot find resources path: ${resourcesPath}`);
}

export { resourcesPath }
