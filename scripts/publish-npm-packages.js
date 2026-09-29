// Publishes the monorepo's reusable libraries to public npmjs.org under the @falang scope.
//
// Scope: only packages/core/*, packages/text/*, packages/typescript/* — the packages
// ADR 0002 (private) calls out as generic/reusable, as opposed to
// packages/workflow/*, packages/workflow-integrations/*, packages/desktop/* which are internal to
// this product and not meant to be installed standalone. Add a new package to REUSABLE_PACKAGE_DIRS
// below if it's added to that same "generic" set later.
//
// All 9 packages are versioned in lockstep (one shared version bumped together each run) so their
// mutual @falang/* dependency ranges never drift apart — simpler than independent per-package
// semver for a set this small and this interdependent.
//
// Every OTHER workspace package (packages/workflow/*, packages/workflow-integrations/*,
// packages/desktop/*, playground*) depends on one or more of these at an *exact* pinned version
// (e.g. "@falang/dto": "1.0.0") — npm workspaces only symlinks a dependency to the local package
// when its version range is actually satisfied, so bumping only the 9 reusable packages' own
// version without also updating every other package.json's reference to them breaks `npm
// install`/`npm ci` repo-wide (confirmed while building this script: npm then tries to fetch the
// old exact version from the real registry and 404s, since these are internal packages never
// published at that version). This script updates every workspace package.json's references too.
//
// Usage:
//   node scripts/publish-npm-packages.js --dry-run           # bump + regenerate lockfile, npm publish --dry-run
//   node scripts/publish-npm-packages.js --yes               # bump + publish for real
//   node scripts/publish-npm-packages.js --yes --bump minor  # minor bump instead of the patch default
//
// Requires `npm login` (or NPM_TOKEN configured in .npmrc) against the public registry beforehand.

const { execFileSync, execSync } = require('node:child_process');
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

const REUSABLE_PACKAGE_DIRS = [
  'packages/core/di',
  'packages/core/dto',
  'packages/core/scheme',
  'packages/core/antd',
  'packages/text/dto',
  'packages/text/scheme',
  'packages/typescript/dto',
  'packages/typescript/common',
  'packages/typescript/scheme',
];

function parseArgs(argv) {
  const args = { bump: 'patch', dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--yes') {
      args.yes = true;
    } else if (arg === '--bump') {
      i += 1;
      args.bump = argv[i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!['patch', 'minor', 'major'].includes(args.bump)) {
    throw new Error(`--bump must be patch|minor|major, got: ${args.bump}`);
  }
  if (!args.dryRun && !args.yes) {
    throw new Error(
      'Refusing to publish without --dry-run or --yes (npm publish cannot be undone). ' +
        'Run with --dry-run first to review what would happen.',
    );
  }
  return args;
}

function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function readPackageJson(dir) {
  const jsonPath = path.join(REPO_ROOT, dir, 'package.json');
  return { path: jsonPath, dir, json: JSON.parse(readFileSync(jsonPath, 'utf8')) };
}

function writePackageJson(pkg) {
  writeFileSync(pkg.path, `${JSON.stringify(pkg.json, null, 2)}\n`);
}

// Mirrors root package.json's "workspaces" globs (./packages/*/*, ./playground,
// ./playground-workflow) — every package.json in the repo that could reference one of the 9
// reusable packages as a dependency, not just the 9 themselves.
function discoverAllWorkspacePackages() {
  const dirs = [];
  const packagesDir = path.join(REPO_ROOT, 'packages');
  for (const domain of readdirSync(packagesDir)) {
    const domainDir = path.join(packagesDir, domain);
    for (const name of readdirSync(domainDir)) {
      if (existsSync(path.join(domainDir, name, 'package.json'))) {
        dirs.push(`packages/${domain}/${name}`);
      }
    }
  }
  for (const dir of ['playground', 'playground-workflow']) {
    if (existsSync(path.join(REPO_ROOT, dir, 'package.json'))) dirs.push(dir);
  }
  return dirs.map((dir) => readPackageJson(dir));
}

function getPublishedVersion(name) {
  try {
    const out = execFileSync('npm', ['view', name, 'version', '--registry', 'https://registry.npmjs.org'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null; // never published
  }
}

function internalDeps(pkg, names) {
  const deps = { ...pkg.json.dependencies, ...pkg.json.devDependencies };
  return Object.keys(deps).filter((dep) => names.has(dep));
}

function topologicalOrder(packages) {
  const names = new Set(packages.map((p) => p.json.name));
  const remaining = new Map(packages.map((p) => [p.json.name, p]));
  const ordered = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((pkg) => internalDeps(pkg, names).every((dep) => !remaining.has(dep)));
    if (ready.length === 0) {
      throw new Error(`Circular dependency among reusable packages: ${[...remaining.keys()].join(', ')}`);
    }
    for (const pkg of ready) {
      ordered.push(pkg);
      remaining.delete(pkg.json.name);
    }
  }
  return ordered;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const packages = REUSABLE_PACKAGE_DIRS.map((dir) => readPackageJson(dir));
  const names = new Set(packages.map((p) => p.json.name));

  console.log('Checking npmjs.org auth...');
  try {
    const whoami = execFileSync('npm', ['whoami', '--registry', 'https://registry.npmjs.org'], {
      encoding: 'utf8',
    }).trim();
    console.log(`  logged in as ${whoami}`);
  } catch {
    if (!args.dryRun) {
      throw new Error('Not logged in to npmjs.org — run `npm login` first (or set up NPM_TOKEN in .npmrc).');
    }
    console.log('  not logged in (fine for --dry-run, required for a real publish)');
  }

  console.log('Resolving the next lockstep version...');
  const localVersions = packages.map((p) => p.json.version);
  const publishedVersions = packages.map((p) => getPublishedVersion(p.json.name)).filter(Boolean);
  const baseline = [...localVersions, ...publishedVersions].toSorted(compareVersions).at(-1);
  const nextVersion = bumpVersion(baseline, args.bump);
  console.log(`  baseline ${baseline} -> ${nextVersion} (${args.bump})`);

  console.log('Bumping package.json files...');
  const reusableDirs = new Set(REUSABLE_PACKAGE_DIRS);
  const allPackages = discoverAllWorkspacePackages();
  for (const pkg of allPackages) {
    let changed = false;
    if (reusableDirs.has(pkg.dir)) {
      pkg.json.version = nextVersion;
      changed = true;
    }
    for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = pkg.json[depField];
      if (!deps) continue;
      for (const dep of Object.keys(deps)) {
        if (!names.has(dep)) continue;
        const prefix = /^[\^~]/.exec(deps[dep])?.[0] ?? '';
        const nextRange = `${prefix}${nextVersion}`;
        if (deps[dep] !== nextRange) {
          deps[dep] = nextRange;
          changed = true;
        }
      }
    }
    if (changed) {
      writePackageJson(pkg);
      const suffix = reusableDirs.has(pkg.dir) ? `-> ${nextVersion}` : '(dependency refs updated)';
      console.log(`  ${pkg.json.name} ${suffix}`);
    }
  }

  console.log('Regenerating package-lock.json (npm install)...');
  execSync('npm install', { cwd: REPO_ROOT, stdio: 'inherit' });

  const order = topologicalOrder(packages);
  console.log(`Publish order: ${order.map((p) => p.json.name).join(' -> ')}`);

  for (const pkg of order) {
    const alreadyPublished = getPublishedVersion(pkg.json.name) === nextVersion;
    if (alreadyPublished && !args.dryRun) {
      console.log(`Skipping ${pkg.json.name}@${nextVersion} — already published (safe to re-run).`);
      continue;
    }
    const publishArgs = ['publish', '--workspace', pkg.json.name, '--access', 'public'];
    if (args.dryRun) publishArgs.push('--dry-run');
    console.log(`\n> npm ${publishArgs.join(' ')}`);
    execFileSync('npm', publishArgs, { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  console.log(
    `\nDone${args.dryRun ? ' (dry run — nothing was actually published)' : ''}. ` +
      'package.json/package-lock.json were modified — review with `git diff` and commit the version bump.',
  );
}

main();
