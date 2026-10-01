import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IDriverBundle } from './driver-bundle.js';
import {
  adoptReferencedDrivers,
  collectReferencedDriverIds,
  deleteDriverDir,
  driverContentHash,
  projectDriversDir,
  readDriverBundle,
  resolveProjectDrivers,
  writeDriverBundle,
} from './project-drivers.js';

const bundleOf = (id: string, marker = 'v1'): IDriverBundle => ({
  formatVersion: 1,
  config: {
    id,
    label: id,
    includes: [`${id}.h`],
    sourceFiles: [`${id}.h`, `${id}.cpp`],
    declarations: [`declare function ${id.replaceAll('-', '_')}_fn(): void;`],
    actions: [{ id: 'do-it', label: 'Do it', fields: [], codeTemplate: `${id.replaceAll('-', '_')}_fn()` }],
  },
  files: { [`${id}.h`]: `// ${marker}`, [`${id}.cpp`]: `// ${marker} cpp` },
});

const readAlphaHeader = async (parent: string): Promise<string> => {
  const bundle = await readDriverBundle(path.join(parent, 'alpha'));
  return bundle.files['alpha.h'];
};

const docWith = (...names: string[]): IProjectDocument => ({
  id: 'd1',
  type: 'function',
  name: 'setup',
  root: {
    id: 'r',
    name: 'function',
    children: [
      {
        id: 'b',
        name: 'function-body',
        children: names.map((name, index) => ({ id: `n${String(index)}`, name, data: {} })),
      },
    ],
  },
});

describe('project drivers', () => {
  // oxlint-disable init-declarations
  let root: string;
  let bundledDir: string;
  let libraryDir: string;
  let projectDir: string;
  // oxlint-enable init-declarations

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-drivers-'));
    bundledDir = path.join(root, 'bundled');
    libraryDir = path.join(root, 'library');
    projectDir = path.join(root, 'project');
    await fs.mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes, reads back, and atomically replaces a driver', async () => {
    const parent = projectDriversDir(projectDir);
    await writeDriverBundle(parent, bundleOf('alpha', 'v1'));
    expect(await readAlphaHeader(parent)).toBe('// v1');

    await writeDriverBundle(parent, bundleOf('alpha', 'v2'));
    expect(await readAlphaHeader(parent)).toBe('// v2');
    // No staging/old leftovers.
    expect(await fs.readdir(parent)).toEqual(['alpha']);

    await deleteDriverDir(parent, 'alpha');
    expect(await fs.readdir(parent)).toEqual([]);
  });

  it('never leaves a half-written driver when the bundle is invalid', async () => {
    const parent = projectDriversDir(projectDir);
    await writeDriverBundle(parent, bundleOf('alpha', 'v1'));
    const broken = { ...bundleOf('alpha', 'v2'), files: { 'alpha.h': '//' } };
    await expect(writeDriverBundle(parent, broken)).rejects.toThrow();
    expect(await readAlphaHeader(parent)).toBe('// v1');
    expect(await fs.readdir(parent)).toEqual(['alpha']);
  });

  it('resolves with project > library > bundled precedence and flags overrides', async () => {
    await writeDriverBundle(bundledDir, bundleOf('stock', 'b'));
    await writeDriverBundle(bundledDir, bundleOf('shared', 'b'));
    await writeDriverBundle(libraryDir, bundleOf('shared', 'l'));
    await writeDriverBundle(libraryDir, bundleOf('lib-only', 'l'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('shared', 'p'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('stock', 'p'));

    const { drivers, errors } = await resolveProjectDrivers({ bundledDir, libraryDir, projectDir });
    expect(errors).toEqual([]);
    const by = Object.fromEntries(drivers.map((d) => [d.config.id, d]));
    expect(by['stock']).toMatchObject({ scope: 'project', overrides: 'bundled' });
    expect(by['shared']).toMatchObject({ scope: 'project', overrides: 'library' });
    expect(by['lib-only']).toMatchObject({ scope: 'library' });
    expect(by['lib-only'].overrides).toBeUndefined();
  });

  it('reports a broken driver folder with its scope', async () => {
    await fs.mkdir(path.join(libraryDir, 'broken'), { recursive: true });
    const { errors } = await resolveProjectDrivers({ bundledDir, libraryDir, projectDir });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ scope: 'library' });
  });

  it('collects ids from driver-action nodes and Devices instances', () => {
    const ids = collectReferencedDriverIds([docWith('driver-action::a::x', 'action', 'driver-action::b::y')], {
      pins: [],
      devices: [{ id: '1', driverId: 'c', name: 'n', params: {} }],
    });
    expect([...ids].toSorted()).toEqual(['a', 'b', 'c']);
  });

  it('adopts only referenced library-scope drivers, idempotently, and reports missing ones', async () => {
    await writeDriverBundle(bundledDir, bundleOf('stock'));
    await writeDriverBundle(libraryDir, bundleOf('lib-used'));
    await writeDriverBundle(libraryDir, bundleOf('lib-unused'));
    const params = {
      bundledDir,
      libraryDir,
      projectDir,
      documents: [
        docWith('driver-action::stock::do-it', 'driver-action::lib-used::do-it', 'driver-action::ghost::do-it'),
      ],
    };
    const first = await adoptReferencedDrivers(params);
    expect(first).toEqual({ adopted: ['lib-used'], missing: ['ghost'] });
    expect(await fs.readdir(projectDriversDir(projectDir))).toEqual(['lib-used']);

    // Now it resolves to project scope, so a second pass adopts nothing.
    const second = await adoptReferencedDrivers(params);
    expect(second.adopted).toEqual([]);
    expect(await fs.readdir(projectDriversDir(projectDir))).toEqual(['lib-used']);
  });

  it('concurrent adoptions do not corrupt the project copy', async () => {
    await writeDriverBundle(libraryDir, bundleOf('lib-used'));
    const params = { bundledDir, libraryDir, projectDir, documents: [docWith('driver-action::lib-used::do-it')] };
    const results = await Promise.all([1, 2, 3, 4].map(() => adoptReferencedDrivers(params)));
    expect(results.flatMap((r) => r.adopted)).toEqual(['lib-used']);
    const dir = projectDriversDir(projectDir);
    expect(await fs.readdir(dir)).toEqual(['lib-used']);
    const copy = await readDriverBundle(path.join(dir, 'lib-used'));
    expect(copy.config.id).toBe('lib-used');
  });

  it('driverContentHash is stable across key order and changes with content', () => {
    const a = bundleOf('x');
    const reordered: IDriverBundle = { ...a, files: Object.fromEntries(Object.entries(a.files).toReversed()) };
    expect(driverContentHash(reordered)).toBe(driverContentHash(a));
    expect(driverContentHash(bundleOf('x', 'other'))).not.toBe(driverContentHash(a));
  });
});
