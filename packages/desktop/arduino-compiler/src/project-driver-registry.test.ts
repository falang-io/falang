/* oxlint-disable no-await-expression-member, no-undefined, no-useless-undefined, init-declarations -- test files: terse awaits on service results and a `let` assigned in beforeEach */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { projectDriversDir, writeDriverBundle, type IDriverBundle } from '@falang/desktop-arduino-dto';
import type { IDriverValidationResult } from './driver-validation-types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDriverRegistry, type TDriverBatchValidator } from './project-driver-registry.js';

const bundleOf = (id: string, marker = 'v1'): IDriverBundle => ({
  formatVersion: 1,
  config: {
    id,
    label: `${id} ${marker}`,
    includes: [`${id}.h`],
    sourceFiles: [`${id}.h`, `${id}.cpp`],
    declarations: [`declare function ${id.replaceAll('-', '_')}_fn(): void;`],
    actions: [{ id: 'do-it', label: 'Do it', fields: [], codeTemplate: `${id.replaceAll('-', '_')}_fn()` }],
  },
  files: { [`${id}.h`]: `// ${marker}`, [`${id}.cpp`]: `// ${marker} cpp` },
});

const OK: IDriverValidationResult = { ok: true, errors: [], warnings: [] };
const BAD: IDriverValidationResult = {
  ok: false,
  errors: [{ stage: 'templates', message: 'does not type-check' }],
  warnings: [],
};

describe('ProjectDriverRegistry', () => {
  let root = '';
  let bundledDir = '';
  let libraryDir = '';
  let projectDir = '';
  // A "driver is broken" switch: any bundle whose header says `broken` fails.
  const validate = vi.fn<TDriverBatchValidator>((items) =>
    Promise.resolve(
      items.map((item) => (Object.values(item.bundle.files).some((t) => t.includes('broken')) ? BAD : OK)),
    ),
  );

  const makeRegistry = (): ProjectDriverRegistry =>
    new ProjectDriverRegistry({
      bundledDir,
      libraryDir,
      validate,
      readProjectContext: () => Promise.resolve(null),
    });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'driver-registry-'));
    bundledDir = path.join(root, 'bundled');
    libraryDir = path.join(root, 'library');
    projectDir = path.join(root, 'project');
    await fs.mkdir(projectDir, { recursive: true });
    validate.mockClear();
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('lists bundled and library drivers before a project is open, trusting bundled ones', async () => {
    await writeDriverBundle(bundledDir, bundleOf('servo'));
    await writeDriverBundle(libraryDir, bundleOf('my-lib'));
    const registry = makeRegistry();
    const payload = await registry.setProject(null);
    expect(payload.drivers.map((d) => [d.config.id, d.scope, d.status])).toEqual([
      ['servo', 'bundled', 'ok'],
      ['my-lib', 'library', 'ok'],
    ]);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls[0][0]).toHaveLength(1);
  });

  it('applies project > library > bundled precedence and reports overrides', async () => {
    await writeDriverBundle(bundledDir, bundleOf('dup', 'bundled'));
    await writeDriverBundle(libraryDir, bundleOf('dup', 'library'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('dup', 'project'));
    await writeDriverBundle(libraryDir, bundleOf('lib-only'));
    const payload = await makeRegistry().setProject(projectDir);
    const dup = payload.drivers.find((d) => d.config.id === 'dup');
    expect(dup).toMatchObject({ scope: 'project', overrides: 'library', status: 'ok' });
    expect(dup?.config.label).toBe('dup project');
    expect(payload.drivers.find((d) => d.config.id === 'lib-only')?.scope).toBe('library');
  });

  it('flags differsFromLibrary only when the project copy differs from the library one', async () => {
    await writeDriverBundle(libraryDir, bundleOf('same'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('same'));
    await writeDriverBundle(libraryDir, bundleOf('changed', 'lib'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('changed', 'proj'));
    const payload = await makeRegistry().setProject(projectDir);
    expect(payload.drivers.find((d) => d.config.id === 'same')?.differsFromLibrary).toBe(false);
    expect(payload.drivers.find((d) => d.config.id === 'changed')?.differsFromLibrary).toBe(true);
  });

  it('keeps serving the last valid version when the files on disk stop validating', async () => {
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('flaky', 'good'));
    const registry = makeRegistry();
    await registry.setProject(projectDir);

    const broken = bundleOf('flaky', 'good');
    await writeDriverBundle(projectDriversDir(projectDir), {
      ...broken,
      config: { ...broken.config, label: 'flaky edited' },
      files: { ...broken.files, 'flaky.cpp': '// broken' },
    });
    const payload = await registry.reload();
    const entry = payload.drivers.find((d) => d.config.id === 'flaky');
    expect(entry?.status).toBe('invalid-on-disk');
    expect(entry?.config.label).toBe('flaky good');
    expect(entry?.errors?.[0]).toContain('does not type-check');
    expect(registry.buildDrivers().find((d) => d.config.id === 'flaky')?.config.label).toBe('flaky good');

    // Fixed on disk -> ok again, new config served.
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('flaky', 'fixed'));
    const fixed = (await registry.reload()).drivers.find((d) => d.config.id === 'flaky');
    expect(fixed?.status).toBe('ok');
    expect(fixed?.config.label).toBe('flaky fixed');
  });

  it('serves the last valid driver as load-error when its folder becomes unreadable, and forgets it once deleted', async () => {
    await writeDriverBundle(libraryDir, bundleOf('gone'));
    const registry = makeRegistry();
    await registry.setProject(null);
    await fs.writeFile(path.join(libraryDir, 'gone', 'driver.config.json'), '{ not json');
    const broken = await registry.reload();
    expect(broken.drivers.find((d) => d.config.id === 'gone')?.status).toBe('load-error');
    expect(broken.loadErrors).toEqual([]);

    await fs.rm(path.join(libraryDir, 'gone'), { recursive: true });
    expect((await registry.reload()).drivers.find((d) => d.config.id === 'gone')).toBeUndefined();
  });

  it('keeps a referenced driver whose folder was deleted as missing-on-disk; an unreferenced one disappears', async () => {
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('used-one'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('unused-one'));
    const registry = new ProjectDriverRegistry({
      bundledDir,
      libraryDir,
      validate,
      readProjectContext: () =>
        Promise.resolve({
          documents: [
            {
              id: 'd1',
              name: 'setup',
              type: 'function',
              root: {
                id: 'r',
                name: 'function',
                children: [{ id: 'n1', name: 'driver-action::used-one::do-it', data: {} }],
              },
            },
          ],
        } as never),
    });
    await registry.setProject(projectDir);
    await fs.rm(path.join(projectDriversDir(projectDir), 'used-one'), { recursive: true });
    await fs.rm(path.join(projectDriversDir(projectDir), 'unused-one'), { recursive: true });
    const payload = await registry.reload();
    expect(payload.drivers.map((d) => [d.config.id, d.status])).toEqual([['used-one', 'missing-on-disk']]);
    expect(payload.drivers[0].config.label).toBe('used-one v1');
    expect(payload.drivers[0].errors?.[0]).toContain('used-one');
    // Still served on the next reload while the project references it.
    expect((await registry.reload()).drivers[0].status).toBe('missing-on-disk');
    // Restored on disk -> ok again.
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('used-one'));
    expect((await registry.reload()).drivers[0].status).toBe('ok');
  });

  it('reports an unreadable driver with no earlier valid version under loadErrors', async () => {
    await fs.mkdir(path.join(libraryDir, 'never-valid'), { recursive: true });
    await fs.writeFile(path.join(libraryDir, 'never-valid', 'driver.config.json'), '{ not json');
    const payload = await makeRegistry().setProject(null);
    expect(payload.drivers).toEqual([]);
    expect(payload.loadErrors).toHaveLength(1);
    expect(payload.loadErrors[0]).toMatchObject({ scope: 'library' });
  });

  it('builds with bundled and project drivers only, never a library one', async () => {
    await writeDriverBundle(bundledDir, bundleOf('servo'));
    await writeDriverBundle(libraryDir, bundleOf('lib-only'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('mine'));
    const registry = makeRegistry();
    await registry.setProject(projectDir);
    expect(
      registry
        .buildDrivers()
        .map((d) => d.config.id)
        .toSorted(),
    ).toEqual(['mine', 'servo']);
  });

  it('validates a project driver against bundled + project others, a library one against bundled + library', async () => {
    await writeDriverBundle(bundledDir, bundleOf('servo'));
    await writeDriverBundle(libraryDir, bundleOf('lib-a'));
    await writeDriverBundle(projectDriversDir(projectDir), bundleOf('proj-a'));
    const registry = makeRegistry();
    await registry.setProject(projectDir);
    const items = validate.mock.calls[0][0];
    const idsFor = (id: string): string[] =>
      items
        .find((item) => item.bundle.config.id === id)
        ?.ctx.otherDrivers.map((d) => d.id)
        .toSorted() ?? [];
    expect(idsFor('proj-a')).toEqual(['servo']);
    expect(idsFor('lib-a')).toEqual(['servo']);
    expect(
      registry
        .otherDriversFor('library')
        .map((d) => d.id)
        .toSorted(),
    ).toEqual(['lib-a', 'servo']);
  });

  it('notifies listeners after every reload and does not re-validate unchanged drivers', async () => {
    await writeDriverBundle(libraryDir, bundleOf('stable'));
    const registry = makeRegistry();
    const listener = vi.fn();
    registry.onChange(listener);
    await registry.setProject(null);
    await registry.reload();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
