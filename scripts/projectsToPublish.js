const fs = require('fs');
const path = require('path');
const projectsList = require('./projectsList');

const baseProjectsToPublish = [
  '@falang/editor-scheme',
  '@falang/editor-ide',
  '@falang/back-fs',
  '@falang/infrastructures-all',
];

/**
 * @type string[]
 */
const projectsToPublish = [];

const addProjectToPublish = (projectName) => {
  const data = projectsList[projectName];
  if (!data) throw new Error(`Project ${projectName} not found`);
  if (!projectsToPublish.includes(projectName)) projectsToPublish.push(projectName);
  for (const depName in data.package.dependencies) {
    if (!depName.includes('@falang')) continue;
    addProjectToPublish(depName);
  }
};

baseProjectsToPublish.forEach(p => addProjectToPublish(p));

module.exports = projectsToPublish;
