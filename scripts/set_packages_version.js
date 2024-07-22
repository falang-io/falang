const fs = require('fs');
const path = require('path');
const projectsList = require('./projectsList');
const projectsToPublish = require('./projectsToPublish');

const version = process.argv[process.argv.length - 1];
if(!version.match(/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/)) {
  console.log(process.argv);
  throw new Error('Should be passed version in format 99.99.99');
}

for(const p of projectsToPublish) {
  const json = {
    ...projectsList[p].package,
  };
  json.version = version;
  fs.writeFileSync(path.join(projectsList[p].path, 'package.json'), JSON.stringify(json, undefined, 2));
}
