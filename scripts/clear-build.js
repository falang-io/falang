const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const projectsList = require('./projectsList');

for(const name in projectsList) {
  const buildDir = path.resolve(projectsList[name].path, 'build');
  if(fs.existsSync(buildDir)) {
    rimraf.sync(buildDir);
  }
}
