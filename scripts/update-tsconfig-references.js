/**
 * This script synchronize tsconfig references with dependencies in package.json for all packages in repo
 */
const fs = require('fs');
const path = require('path');
const projectsList = require('./projectsList');

for (const projectName in projectsList) {
  const projectDeps = [];
  if (!projectsList[projectName].package.dependencies) continue;
  for(const depName in projectsList[projectName].package.dependencies) {
    if(depName in projectsList) {
      projectDeps.push(depName);
    }
  }
  const projectDepsPaths = projectDeps.map(dep => path.join(path.relative(projectsList[projectName].path, projectsList[dep].path), 'tsconfig.json'));

  const tsConfigRefsPaths = [];
  if(projectsList[projectName].ts.references) {
    for(let i = 0; i < projectsList[projectName].ts.references.length; i++) {
      tsConfigRefsPaths.push(projectsList[projectName].ts.references[i].path);
    }
  }

  const newTsConfigRefs = projectDepsPaths.filter((dep) => !tsConfigRefsPaths.includes(dep));

  if(projectName === 'server') {
    console.log({
      deps: projectsList[projectName].package.dependencies,
      p: projectsList[projectName],
      newTsConfigRefs,
      tsConfigRefsPaths,
    });
  }

  if(newTsConfigRefs.length) {
    const newTs = {
      ...projectsList[projectName].ts,
      references: projectDepsPaths.map(path => ({ path }))
    };
    const targetFile = path.join(projectsList[projectName].path, 'tsconfig.json');
    fs.writeFileSync(targetFile, JSON.stringify(newTs, undefined, 2));
    console.log(`upated ${targetFile}`);
  }
}