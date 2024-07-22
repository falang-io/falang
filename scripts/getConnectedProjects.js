const projectsList = require('./projectsList');

export function getConnectedProjects(projectName) {
  if(false === (projectName in projectsList) || !projectsList[projectName].package.dependencies) return [];
  const allDependencies = new Set();
  const dependencies = Object.keys(projectsList[projectName].package.dependencies).filter((key) => key.startsWith('@crm/'));
  const childDependencies = dependencies.map((dep) => getConnectedProjects(dep)).flat();
  dependencies.forEach((dep) => allDependencies.add(dep));
  childDependencies.forEach((dep) => allDependencies.add(dep))
  return Array.from(allDependencies);
}
