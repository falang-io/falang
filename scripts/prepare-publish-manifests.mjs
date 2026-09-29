#!/usr/bin/env node
/* oxlint-disable func-style, max-depth, no-console, no-inline-comments, no-nested-ternary, prefer-template, typescript/no-dynamic-delete, unicorn/no-array-sort -- one-off maintenance script */
/**
 * Idempotent, mechanical prep of every workspace manifest for publishing the monorepo as TypeScript
 * sources (no build step; every `main` is `src/index.ts`) under AGPL-3.0-only:
 *
 *  1. `license` -> "AGPL-3.0-only" (root, packages/STAR/STAR, playgrounds, activepieces/).
 *  2. every `@falang/*` entry in dependencies/devDependencies/peerDependencies -> "*".
 *  3. `files` for packages/STAR/STAR: sources minus tests, plus per-package runtime assets (EXTRA_FILES below).
 *  4. `@types/<x>` moved devDependencies -> dependencies when a NON-test file under `src/` imports
 *     `<x>` (a consumer's tsc type-checks the .ts sources inside node_modules, so it needs those types).
 *     `@types/node` counts when non-test code imports a Node builtin; `@types/react` when it imports react
 *     or contains a .tsx file.
 *
 * Usage: node scripts/prepare-publish-manifests.mjs [--dry]   (prints every @types move it makes)
 * Add a package's runtime assets that live outside src/ to EXTRA_FILES.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dry = process.argv.includes('--dry');
const LICENSE = 'AGPL-3.0-only';

const BASE_FILES = [
  'src',
  '!src/**/*.test.ts',
  '!src/**/*.test.tsx',
  '!src/**/*.e2e.test.ts',
  '!src/**/*.workflow-e2e-spec.ts',
  '!src/**/*.spec.ts',
  '!src/**/*.docker-e2e-spec.ts',
  '!src/**/*-test-harness.ts',
  '!src/test-utils',
  '!src/**/__snapshots__',
];

/** Runtime assets outside `src/` a published consumer needs, keyed by package name. */
const EXTRA_FILES = {
  '@falang/desktop-app-arduino': ['resources/drivers'],
  '@falang/scheme': ['test-utils'], // imported by other packages' tests as `@falang/scheme/test-utils/...`
  '@falang/desktop-mcp': ['dist'], // `bin` target (built by `npm run build`)
};

// Test-only typings: never shipped sources' concern (the files importing them are excluded above).
const TEST_ONLY_TYPES = new Set(['@types/supertest']);

const TEST_FILE = /\.(test|spec|e2e\.test|workflow-e2e-spec)\.tsx?$/;

const listDirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'node_modules')
    : [];

const manifests = [path.join(root, 'package.json')];
for (const domain of listDirs(path.join(root, 'packages')))
  for (const pkg of listDirs(path.join(root, 'packages', domain.name)))
    manifests.push(path.join(root, 'packages', domain.name, pkg.name, 'package.json'));
for (const extra of ['playground', 'playground-workflow', 'activepieces'])
  manifests.push(path.join(root, extra, 'package.json'));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__snapshots__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(e.name) && !TEST_FILE.test(e.name)) out.push(p);
  }
  return out;
}

const builtins = new Set(builtinModules.map((m) => m.replace(/^node:/, '').split('/')[0]));
const IMPORT_RE =
  /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"]([^'"]+)['"]|\/\/\/\s*<reference\s+types=['"]([^'"]+)['"]/g;

function usedModules(pkgDir) {
  const src = path.join(pkgDir, 'src');
  const mods = new Set();
  let hasTsx = false;
  if (!existsSync(src)) return { mods, hasTsx };
  for (const file of walk(src)) {
    if (file.endsWith('.tsx')) hasTsx = true;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith('.')) continue;
      if (spec.startsWith('node:')) mods.add('node:builtin');
      else {
        const parts = spec.split('/');
        const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
        mods.add(builtins.has(name) ? 'node:builtin' : name);
      }
    }
  }
  return { mods, hasTsx };
}

const typesToModule = (t) => {
  const n = t.replace(/^@types\//, '');
  return n.includes('__') ? `@${n.replace('__', '/')}` : n;
};

for (const file of manifests) {
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, 'utf8');
  const pkg = JSON.parse(raw);
  const dir = path.dirname(file);
  const isPackage = file.includes(`${path.sep}packages${path.sep}`);

  pkg.license = LICENSE;

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'])
    for (const name of Object.keys(pkg[field] ?? {})) if (name.startsWith('@falang/')) pkg[field][name] = '*';

  if (isPackage) {
    pkg.files = [BASE_FILES[0], ...(EXTRA_FILES[pkg.name] ?? []), ...BASE_FILES.slice(1)];

    for (const t of TEST_ONLY_TYPES) {
      if (pkg.dependencies?.[t]) {
        pkg.devDependencies = { ...pkg.devDependencies, [t]: pkg.dependencies[t] };
        delete pkg.dependencies[t];
      }
    }
    const { mods, hasTsx } = usedModules(dir);
    for (const t of Object.keys(pkg.devDependencies ?? {}).filter((k) => k.startsWith('@types/'))) {
      const m = typesToModule(t);
      const used = m === 'node' ? mods.has('node:builtin') : m === 'react' ? mods.has('react') || hasTsx : mods.has(m);
      if (!used || TEST_ONLY_TYPES.has(t)) continue;
      pkg.dependencies = { ...pkg.dependencies, [t]: pkg.devDependencies[t] };
      delete pkg.devDependencies[t];
      console.log(`${pkg.name}: moved ${t} -> dependencies`);
    }
    // Undeclared @types (previously satisfied only by hoisting from a sibling package): add when the imported
    // module ships no types of its own but @types/<module> is installed at the repo root.
    const declared = (t) => pkg.dependencies?.[t] ?? pkg.devDependencies?.[t] ?? pkg.peerDependencies?.[t];
    const candidates = [...mods].filter((m) => m !== 'node:builtin' && !m.startsWith('@falang/'));
    const wanted = candidates.map((m) => ['@types/' + (m.startsWith('@') ? m.slice(1).replace('/', '__') : m), m]);
    if (mods.has('node:builtin')) wanted.push(['@types/node', null]);
    for (const [t, m] of wanted) {
      if (declared(t) || m === 'react-dom') continue;
      const typesPkg = path.join(root, 'node_modules', t, 'package.json');
      if (!existsSync(typesPkg)) continue;
      if (m) {
        const own = path.join(root, 'node_modules', m, 'package.json');
        if (existsSync(own)) {
          const ownText = readFileSync(own, 'utf8');
          if (/"(types|typings)"\s*:/.test(ownText) || /\.d\.ts"/.test(ownText)) continue;
        }
      }
      const version = '^' + JSON.parse(readFileSync(typesPkg, 'utf8')).version;
      pkg.dependencies = { ...pkg.dependencies, [t]: t === '@types/node' ? '^25.5.0' : version };
      console.log(`${pkg.name}: added undeclared ${t} to dependencies`);
    }
    if (pkg.devDependencies)
      pkg.devDependencies = Object.fromEntries(
        Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)),
      );
    if (pkg.dependencies)
      pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)));
    if (pkg.devDependencies && Object.keys(pkg.devDependencies).length === 0) delete pkg.devDependencies;
  }

  const out = JSON.stringify(pkg, null, 2) + (raw.endsWith('\n') ? '\n' : '');
  if (!dry && out !== raw) writeFileSync(file, out);
}
