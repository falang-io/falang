import * as glob from 'glob';
import * as path from 'path';
import * as fs from 'fs';

const domainsRoot = path.resolve(__dirname, '../src/domains');
const patterns: string[] = ['/**/*.dto.ts', '/**/constants.ts'];
let dtoFiles: string[] = [];
for (const pattern of patterns) {
  dtoFiles = dtoFiles.concat(glob.sync(`${domainsRoot}${pattern}`));
}
const destinationDir = path.resolve(__dirname, '../../../frontend/client/src/domains/api');
const exportFiles: string[] = [];

for (const sourceFilename of dtoFiles) {
  const relativeName = sourceFilename.replace(domainsRoot, '');
  exportFiles.push(relativeName);
  const newFileName = `${destinationDir}${relativeName}`;
  const newDir = path.dirname(newFileName);
  fs.mkdirSync(newDir, {
    recursive: true,
  });
  let contents = fs.readFileSync(sourceFilename).toString();
  contents = `/* File was copied from /server/src/domains${relativeName} */\n${contents}`;
  fs.writeFileSync(newFileName, contents);
  console.log(`${sourceFilename} -> ${newFileName}`);
}

fs.writeFileSync(
  `${destinationDir}/index.ts`,
  exportFiles
    .map((f) => `export * from '.${f.replace(/\.ts$/, '')}';`)
    .join('\n')
    .concat('\n'),
);

console.log('Done.');
