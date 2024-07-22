const projectsToPublish = require('./projectsToPublish.js');
const projectsList = require('./projectsList.js');
const path = require('path');
const fs = require('fs');
const copyfiles = require('copyfiles');
const { rimrafSync } = require('rimraf');
const { execSync } = require('child_process');
const { cwd } = require('process');

const pathsToCopy = [
  'src',
  'dist',
  'README.MD',
];

const goCopyFiles = (from, to) => {
  if (fs.statSync(from).isDirectory()) {
    if (!fs.existsSync(to)) {
      fs.mkdirSync(to, { recursive: true });
    }
    const contents = fs.readdirSync(from);
    for(item of contents) {
      goCopyFiles(path.join(from, item), path.join(to, item));
    }
    return;
  }
  fs.cpSync(from, to);
}

const licenseFilePath = path.resolve(__dirname, '../LICENSE');

const run = () => {

  for (const projectName of projectsToPublish) {
    const data = projectsList[projectName];
    const outPath = path.join('/tmp/falang_publish', projectName);
    if (fs.existsSync(outPath)) rimrafSync(outPath);
    rimrafSync(path.join(data.path, 'dist'));
    fs.mkdirSync(outPath, { recursive: true });
    const tscPath = path.resolve(__dirname, '../node_modules/.bin/tsc');
    console.log(`Building ${projectName} in ${data.path}`);
    execSync(
      `${tscPath} --build`,
      { stdio: 'inherit', cwd: data.path }
    );
    for (const pathToCopy of pathsToCopy) {
      const from = path.join(data.path, pathToCopy);
      let to = path.join(outPath, pathToCopy);
      if (!fs.existsSync(from)) continue;
      goCopyFiles(from, to);
    }
    const package = {
      ...data.package,
      license: 'SSPL',
      main: 'dist/src/index.js',
      author: {
        email: "sachik-sergey@yandex.ru",
        name: "Sergey Sachik"
      },
      publishConfig: { access: 'public'},
      repository: "falang-io/falang",
      dependencies: { ...data.package.dependencies },
    };
    for (const dep in package.dependencies) {
      if(dep.includes('@falang')) {
        package.dependencies[dep] = package.version;
        continue;
      }
      let version = package.dependencies[dep];
      version = version.replace('.*', '.0').replace('.x', '.0').replace('^', '')
      version = '>='.concat(version);
      package.dependencies[dep] = version;
    }
    fs.writeFileSync(path.join(outPath, 'package.json'), JSON.stringify(package, undefined, 2));
    fs.rmSync(path.join(outPath, 'dist', 'tsconfig.tsbuildinfo'))
    fs.cpSync(licenseFilePath, path.resolve(outPath, 'LICENSE'));
    console.log(`${projectName} ready to publish`);
  }
  console.log('---');
  console.log('Publishing');
  console.log('---');
  for (const projectName of projectsToPublish) {
    const outPath = path.join('/tmp/falang_publish', projectName);
    execSync(
      `npm publish`,
      { stdio: 'inherit', cwd: outPath }
    );
  }
  console.log('Done');
  process.exit(0);
}


run();