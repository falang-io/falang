#!/usr/bin/env node
// JSON-editing helpers for publish-snapshot.sh. Usage:
//   publish-snapshot.mjs list <root>                       -> prints publishable package dirs (relative), one per line
//   publish-snapshot.mjs rewrite <root> <version> <sha> <branch> <publishedAt>
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_FILES = ['src', '!src/**/*.test.ts', '!src/**/*.e2e.test.ts', '!src/**/*.workflow-e2e-spec.ts'];
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

const readPackage = (dir) => {
  const pkgPath = join(dir, 'package.json');
  return existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : null;
};

const isPublishable = (pkg) => pkg !== null && pkg.private !== true && !pkg.name?.startsWith('playground');

const packageDirs = (root) => {
  const base = join(root, 'packages');
  const dirs = readdirSync(base)
    .filter((domain) => statSync(join(base, domain)).isDirectory())
    .flatMap((domain) => readdirSync(join(base, domain)).map((name) => join('packages', domain, name)))
    .filter((dir) => !dir.split('/').at(-1).startsWith('playground'))
    .filter((dir) => isPublishable(readPackage(join(root, dir))));
  return dirs.toSorted();
};

const rewriteDeps = (pkg) => {
  for (const field of DEP_FIELDS) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (dep.startsWith('@falang/')) pkg[field][dep] = '*';
    }
  }
};

const [cmd, root, version, sha, branch, publishedAt] = process.argv.slice(2);

if (cmd === 'list') {
  process.stdout.write(
    packageDirs(root)
      .map((d) => `${d}\n`)
      .join(''),
  );
} else if (cmd === 'rewrite') {
  for (const d of packageDirs(root)) {
    const pkgPath = join(root, d, 'package.json');
    const pkg = readPackage(join(root, d));
    pkg.version = version;
    pkg.falangSnapshot = { sha, shortSha: sha.slice(0, 7), branch, publishedAt };
    rewriteDeps(pkg);
    if (!pkg.files) pkg.files = DEFAULT_FILES;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
} else {
  process.stderr.write('unknown command\n');
  process.exit(2);
}
