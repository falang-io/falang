/**
 * replace 
 * <<"main": "src/index.ts",>>
 * to
 * <<"main": "build/index.js", "types": "build/index.d.ts",>>
 * in all package.json files
 * (used while publishing)
 */
const fs = require('fs');
const path = require('path');

const startDir = path.join(path.dirname(__dirname), 'packages');

const scanDir = (dir) => {
  const packageJsonPath = path.join(dir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    let packageJsonContents;
    try {
      packageJsonContents = fs.readFileSync(packageJsonPath).toString();
    } catch (err) {
      console.error('Unable to parse ', packageJsonPath);
      console.error(err);
      process.exit(1);
    }
    fs.writeFileSync(packageJsonPath, packageJsonContents.replace('"main": "src/index.ts",', '"main": "build/src/index.js", "types": "build/src/index.d.ts",'));
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
