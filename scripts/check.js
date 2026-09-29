const { execFileSync } = require('node:child_process');
const { readdirSync, existsSync } = require('node:fs');
const path = require('node:path');

const packagesRoot = path.resolve(__dirname, '..', 'packages');

function findPackageDirs(root) {
  const dirs = [];
  for (const domain of readdirSync(root, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    const domainPath = path.join(root, domain.name);
    for (const pkg of readdirSync(domainPath, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const pkgPath = path.join(domainPath, pkg.name);
      if (existsSync(path.join(pkgPath, 'tsconfig.build.json'))) {
        dirs.push(pkgPath);
      }
    }
  }
  return dirs;
}

function packageName(pkgPath) {
  return require(path.join(pkgPath, 'package.json')).name;
}

const pkgDirs = findPackageDirs(packagesRoot);
let hadError = false;

for (const pkgPath of pkgDirs) {
  const name = packageName(pkgPath);
  console.log(`\n> npm run check -w ${name}`);
  try {
    execFileSync('npm', ['run', 'check', '-w', name], { stdio: 'inherit' });
  } catch {
    hadError = true;
  }
}

process.exit(hadError ? 1 : 0);
