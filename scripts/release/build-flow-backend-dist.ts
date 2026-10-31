// oxlint-disable no-console -- this is a CLI: console is its output.
/**
 * Assembles `backend-dist`: the self-contained backend of the Falang Flow desktop app (ADR 0072 (private), phase 2).
 *
 * Why it exists: the workflow backend runs from TypeScript sources through `tsx` (no build step anywhere), spawns a
 * build worker with `process.execPath --import tsx`, bundles workflows with `@temporalio/worker`'s webpack (which
 * must find `@temporalio/workflow` in a real `node_modules` tree above the backend) and the runner `require`s
 * `@falang/workflow-integrations-*` sources at run time. So the backend and its dependencies must be REAL FILES
 * outside `app.asar`, resolvable by plain Node from the directory, without the monorepo and without a registry.
 *
 * Mechanism (registry-free): every workspace package is packed with `npm pack` (honours the manifest's `files`, so
 * sources minus tests) into `<out>/.tarballs`; a generated consumer `package.json` depends on `@falang/workflow-local`
 * as a tarball and `overrides` every workspace package name to its tarball (internal specs are `"*"`, and an
 * override replaces them). `npm install --omit=dev` then installs real copies (no symlinks). The consumer also gets
 * `tsx`/`typescript` (the same versions the monorepo uses) and the cloud edition's `tsconfig.json` (tsx applies a
 * tsconfig only to files it includes and skips node_modules by default, hence the explicit `include`).
 *
 * Usage (from the community root): `npx tsx scripts/release/build-flow-backend-dist.ts [--out <dir>] [--keep-tarballs]`
 * Default out: `packages/desktop/app-flow/backend-dist`. Run with `process.execPath`-based children only: nothing
 * here relies on `node` being on PATH except the `npm` it shells out to.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const flagValue = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i === -1 ? null : (argv[i + 1] ?? null);
};
const out = path.resolve(flagValue('--out') ?? path.join(root, 'packages', 'desktop', 'app-flow', 'backend-dist'));
const keepTarballs = argv.includes('--keep-tarballs');

interface IManifest {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

const listWorkspace = (): { dir: string; manifest: IManifest }[] => {
  const result: { dir: string; manifest: IManifest }[] = [];
  const packagesDir = path.join(root, 'packages');
  for (const domain of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    for (const pkg of fs.readdirSync(path.join(packagesDir, domain.name), { withFileTypes: true })) {
      const dir = path.join(packagesDir, domain.name, pkg.name);
      const file = path.join(dir, 'package.json');
      if (pkg.isDirectory() && fs.existsSync(file)) result.push({ dir, manifest: readJson<IManifest>(file) });
    }
  }
  return result;
};

const run = (cmd: string, args: string[], cwd: string): string =>
  execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });

const workspace = listWorkspace();
const byName = new Map(workspace.map((w) => [w.manifest.name, w]));

// Transitive closure of runtime @falang/* dependencies of the entry package (devDependencies are not installed).
const ENTRY = '@falang/workflow-local';
const needed = new Set<string>();
const visit = (name: string): void => {
  if (needed.has(name)) return;
  const entry = byName.get(name);
  if (!entry) throw new Error(`Workspace package ${name} not found`);
  needed.add(name);
  for (const dep of Object.keys(entry.manifest.dependencies ?? {})) if (dep.startsWith('@falang/')) visit(dep);
};
visit(ENTRY);

fs.rmSync(out, { recursive: true, force: true });
const tarballDir = path.join(out, '.tarballs');
fs.mkdirSync(tarballDir, { recursive: true });

const tarballs = new Map<string, string>();
for (const name of needed) {
  const entry = byName.get(name);
  if (!entry) throw new Error(`Workspace package ${name} not found`);
  const json = run('npm', ['pack', '--json', '--pack-destination', tarballDir, '--ignore-scripts'], entry.dir);
  const filename = String((JSON.parse(json) as { filename: string }[])[0]?.filename);
  tarballs.set(name, path.join(tarballDir, path.basename(filename)));
}
console.log(`packed ${tarballs.size} workspace packages`);

const rootManifest = readJson<IManifest>(path.join(root, 'package.json'));
const tsxVersion = readJson<IManifest>(path.join(root, 'node_modules', 'tsx', 'package.json')).version;
const typescriptVersion = rootManifest.devDependencies?.typescript ?? rootManifest.dependencies?.typescript ?? '^6.0.2';
const spec = (name: string): string => {
  const tarball = tarballs.get(name) ?? '';
  return `file:${path.relative(out, tarball).split(path.sep).join('/')}`;
};

const consumer = {
  name: 'falang-flow-backend-dist',
  version: '1.0.0',
  private: true,
  license: 'AGPL-3.0-only',
  dependencies: { [ENTRY]: spec(ENTRY), tsx: tsxVersion, typescript: typescriptVersion },
  overrides: Object.fromEntries([...needed].filter((n) => n !== ENTRY).map((n) => [n, spec(n)])),
};
fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(consumer, null, 2)}\n`);

// Same template as the cloud edition's tsconfig.base.json (see its comment): tsx needs include/exclude for sources
// installed under node_modules, and the Nest/TypeORM decorators need both experimental flags.
const tsconfig = {
  compilerOptions: {
    target: 'esnext',
    module: 'nodenext',
    moduleResolution: 'nodenext',
    lib: ['ESNext', 'dom'],
    esModuleInterop: true,
    isolatedModules: true,
    resolveJsonModule: true,
    strict: true,
    skipLibCheck: true,
    importHelpers: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    jsx: 'react-jsx',
    types: ['node'],
  },
  include: ['node_modules/@falang/*/src/**/*.ts'],
  exclude: [],
};
fs.writeFileSync(path.join(out, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);

run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'], out);
if (!keepTarballs) fs.rmSync(tarballDir, { recursive: true, force: true });
console.log(`backend-dist ready: ${out}`);
