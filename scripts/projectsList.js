/**
 * This scripts default export is list of current monorepo projects: 
 * {
 *  "projectName": {
 *    path: string,
 *    project: object, // contents of package.json
 *    ts: object, // contents of tsconfig.json
 *  },
 *  ...
 * }
 */
const fs = require('fs');
const path = require('path');

let startDir = path.join(path.dirname(__dirname), 'packages');
if(!fs.existsSync(startDir))  {
  startDir = path.join(path.dirname(path.dirname(__dirname)), 'packages');
}
/**
 * @type Record<string, { path: string, package: { dependencies: Record<string, string>, name: string, version: string, main: string}, ts: any}>
 */
const packages = {};

const scanDir = (dir) => {
  const packageJsonPath = path.join(dir, 'package.json');
  const tsConfigPath = path.join(dir, 'tsconfig.json');
  if (fs.existsSync(packageJsonPath)) {
    if (!fs.existsSync(tsConfigPath)) {
      console.log(`tsconfig not exists: ${tsConfigPath}`)
    };
    let packageJsonContents;
    try {
      packageJsonContents = JSON.parse(fs.readFileSync(packageJsonPath).toString().replace(/,[ \n]+\}/g, '}'));
    } catch (err) {
      console.error('Unable to parse ', packageJsonPath);
      console.error(err);
      process.exit(1);
    }
    let tsConfigContents;
    try {
      tsConfigContents = JSON.parse(fs.readFileSync(tsConfigPath).toString().replace(/,[ \n]+\}/g, '}'));
    } catch (err) {
      console.error('Unable to parse ', tsConfigPath);
      console.error(err);
      process.exit(1);
    }
    const name = packageJsonContents.name;
    packages[name] = {
      path: dir,
      package: packageJsonContents,
      ts: tsConfigContents
    };
    return;
  }
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (!fs.lstatSync(filePath).isDirectory()) continue;
    if (file === 'node_modules' || file === 'src' || file === 'dist') continue;
    scanDir(filePath);
  }
};

scanDir(startDir);

module.exports = packages;
