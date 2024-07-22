import 'reflect-metadata';
import { runners } from '../util/runners';
import { buidProject } from '../util/buildProject';
import * as fs from 'fs';
import * as path from 'path'
import { projectRootDirName } from '../constants';
import { clearCode } from '../util/clearCode';

/**
 * npm run run-code MonteCaro go
 */
const main = async () => {
  const projectsDirNames = fs.readdirSync(projectRootDirName);
  const selectedRunnerAlias = process.argv[process.argv.length - 1];
  const selectedProjectName = process.argv[process.argv.length - 2];
  if(!(projectsDirNames.includes(selectedProjectName))) {
    throw new Error(`Wrong project: ${selectedProjectName}, available projects: ${projectsDirNames.join(',')}`);
  }
  const selectedRunner = runners.find((item) => item.alias === selectedRunnerAlias);
  if(!selectedRunner) throw new Error(`Runner not found: ${selectedRunnerAlias}. Available runners: ${runners.map((r) => r.alias).join(',')}`);
  clearCode();
  await buidProject(selectedProjectName);
  const result = await selectedRunner.handler(path.resolve(projectRootDirName, selectedProjectName, 'code'));
  console.log('Finished. Result:');
  console.log(JSON.stringify(result, undefined, 2));
}

main();
