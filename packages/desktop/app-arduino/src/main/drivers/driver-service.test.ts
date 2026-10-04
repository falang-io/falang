/* oxlint-disable no-await-expression-member, no-undefined, no-useless-undefined, init-declarations -- test files: terse awaits on service results and a `let` assigned in beforeEach */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import {
  buildDriverActionNodeName,
  projectDriversDir,
  readDriverBundle,
  writeDriverBundle,
  type IDriverBundle,
} from '@falang/desktop-arduino-dto';
import { validateDriverBundle } from '@falang/desktop-arduino-compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTemplateBundle,
  createDriverService,
  DriverBuildBlockedError,
  type IDriverServiceDeps,
} from './driver-service.js';
import { ProjectDriverRegistry } from './project-driver-registry.js';

const bundleOf = (id: string, marker = 'v1'): IDriverBundle => {
  const base = buildTemplateBundle(id, `${id} ${marker}`);
  return { ...base, files: { ...base.files, [`${id}.h`]: `${base.files[`${id}.h`]}// ${marker}\n` } };
};

const docUsing = (driverId: string): IProjectDocument => ({
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
        children: [{ id: 'n1', name: buildDriverActionNodeName(driverId, 'blink'), data: { pin: '13', times: '3' } }],
      },
    ],
  },
});

describe('driver service', () => {
  let root = '';
  let libraryDir = '';
  let projectDir = '';
  let registry: ProjectDriverRegistry;
  let projectDocuments: IProjectDocument[] = [];
  const markProject = vi.fn();
  const markLibrary = vi.fn();
  // Real stages 1-3 (schema, collisions, templates) — no worker, no CLI.
  const validate = vi.fn((bundle: unknown) => validateDriverBundle(bundle, { otherDrivers: [] }));

  const withProjectWrite = vi.fn((_dir: string, write: () => Promise<unknown>) => write());

  const makeService = () =>
    createDriverService({
      withProjectWrite: withProjectWrite as unknown as NonNullable<IDriverServiceDeps['withProjectWrite']>,
      registry,
      bundledDir: path.join(root, 'bundled'),
      libraryDir,
      readProjectContext: () => Promise.resolve({ documents: projectDocuments, devicesData: null }),
      validate,
      markOwnProjectWrite: markProject,
      markOwnLibraryWrite: markLibrary,
    });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'driver-service-'));
    libraryDir = path.join(root, 'library');
    projectDir = path.join(root, 'project');
    await fs.mkdir(projectDir, { recursive: true });
    projectDocuments = [];
    markProject.mockClear();
    markLibrary.mockClear();
    withProjectWrite.mockClear();
    registry = new ProjectDriverRegistry({
      bundledDir: path.join(root, 'bundled'),
      libraryDir,
      validate: (items) =>
        Promise.all(items.map((item) => validateDriverBundle(item.bundle, { otherDrivers: item.ctx.otherDrivers }))),
      readProjectContext: () => Promise.resolve(null),
    });
    await registry.setProject(projectDir);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('createFromTemplate scaffolds a valid project driver with a unique function prefix', async () => {
    const service = makeService();
    const result = await service.createFromTemplate('my-sensor', 'My sensor');
    expect(result.validation.ok).toBe(true);
    expect(result.dir).toBe(path.join(projectDriversDir(projectDir), 'my-sensor'));
    const bundle = await readDriverBundle(result.dir as string);
    expect(bundle.config.declarations[0]).toContain('my_sensor_blink');
    expect(registry.getPayload().drivers.map((d) => d.config.id)).toContain('my-sensor');
    expect(markProject).toHaveBeenCalled();
    expect((await service.createFromTemplate('my-sensor', 'again')).validation.ok).toBe(false);
    expect((await service.createFromTemplate('Bad Id', 'x')).validation.ok).toBe(false);
  });

  it('save refuses an invalid bundle and writes nothing', async () => {
    const service = makeService();
    const bad = bundleOf('bad-one');
    bad.config.actions[0].codeTemplate = 'not_declared_anywhere(${pin})';
    const result = await service.save(bad, 'project');
    expect(result.ok).toBe(false);
    await expect(fs.access(path.join(projectDriversDir(projectDir), 'bad-one'))).rejects.toThrow();
  });

  it('copies between project and library through validation', async () => {
    const service = makeService();
    await service.save(bundleOf('shared'), 'project');
    expect((await service.saveToLibrary('shared')).ok).toBe(true);
    expect(markLibrary).toHaveBeenCalled();
    expect((await readDriverBundle(path.join(libraryDir, 'shared'))).config.id).toBe('shared');

    await writeDriverBundle(libraryDir, bundleOf('shared', 'v2'));
    await registry.reload();
    expect(registry.getPayload().drivers.find((d) => d.config.id === 'shared')?.differsFromLibrary).toBe(true);
    expect((await service.replaceWithLibrary('shared')).ok).toBe(true);
    expect(registry.getPayload().drivers.find((d) => d.config.id === 'shared')?.differsFromLibrary).toBe(false);

    await writeDriverBundle(libraryDir, bundleOf('lib-extra'));
    expect((await service.addFromLibrary('lib-extra')).ok).toBe(true);
    expect((await readDriverBundle(path.join(projectDriversDir(projectDir), 'lib-extra'))).config.id).toBe('lib-extra');
    expect((await service.addFromLibrary('nope')).ok).toBe(false);
  });

  it('refuses to delete a project driver that is in use and lists the usages', async () => {
    const service = makeService();
    await service.save(bundleOf('in-use'), 'project');
    projectDocuments = [docUsing('in-use')];
    const refused = await service.delete('in-use', 'project');
    expect(refused.deleted).toBe(false);
    if (!refused.deleted) expect(refused.usages).toEqual([expect.objectContaining({ kind: 'node', nodeId: 'n1' })]);
    projectDocuments = [];
    expect(await service.delete('in-use', 'project')).toEqual({ deleted: true });
    expect(registry.getPayload().drivers.find((d) => d.config.id === 'in-use')).toBeUndefined();
  });

  it('deletes a library driver without a usages check', async () => {
    await writeDriverBundle(libraryDir, bundleOf('lib-del'));
    const service = makeService();
    expect(await service.delete('lib-del', 'library')).toEqual({ deleted: true });
    await expect(fs.access(path.join(libraryDir, 'lib-del'))).rejects.toThrow();
  });

  it('importFolder reads a driver folder as a bundle and reports an unreadable one as a failure', async () => {
    const service = makeService();
    const folder = path.join(root, 'elsewhere');
    await writeDriverBundle(folder, bundleOf('imported'));
    expect((await service.importFolder(path.join(folder, 'imported'), 'project')).ok).toBe(true);
    const missing = await service.importFolder(path.join(folder, 'nothing'), 'project');
    expect(missing.ok).toBe(false);
  });

  it('adopts a referenced library driver into the project and returns bundled ∪ project drivers for a build', async () => {
    await writeDriverBundle(libraryDir, bundleOf('needed'));
    await writeDriverBundle(libraryDir, bundleOf('unused'));
    await registry.reload();
    const service = makeService();
    expect(registry.buildDrivers().map((d) => d.config.id)).toEqual([]);
    const drivers = await service.prepareBuildDrivers(projectDir, [docUsing('needed')]);
    expect(drivers.map((d) => d.config.id)).toEqual(['needed']);
    expect((await readDriverBundle(path.join(projectDriversDir(projectDir), 'needed'))).config.id).toBe('needed');
    await expect(fs.access(path.join(projectDriversDir(projectDir), 'unused'))).rejects.toThrow();
  });

  it('refuses a build when a used driver is invalid on disk, but not when only an unused one is', async () => {
    const service = makeService();
    await service.save(bundleOf('used-one'), 'project');
    await service.save(bundleOf('unused-one'), 'project');
    await Promise.all(
      ['used-one', 'unused-one'].map((id) =>
        fs.writeFile(path.join(projectDriversDir(projectDir), id, 'driver.config.json'), '{ not json'),
      ),
    );
    await registry.reload();
    expect(registry.getPayload().drivers.find((d) => d.config.id === 'used-one')?.status).toBe('load-error');

    const refusal = service.prepareBuildDrivers(projectDir, [docUsing('used-one')]);
    await expect(refusal).rejects.toBeInstanceOf(DriverBuildBlockedError);
    await expect(refusal).rejects.toThrow('used-one');
    // Only the unused one is broken -> the build is allowed.
    await expect(service.prepareBuildDrivers(projectDir, [docUsing('nothing-here')])).resolves.toBeDefined();
  });

  it('routes project writes through withProjectWrite exactly once each, and library writes never', async () => {
    const service = makeService();
    await service.save(bundleOf('a'), 'project');
    expect(withProjectWrite).toHaveBeenCalledTimes(1);
    expect(withProjectWrite).toHaveBeenLastCalledWith(projectDir, expect.any(Function));

    withProjectWrite.mockClear();
    // createFromTemplate saves inside (no nesting); saveToLibrary writes the library only.
    await service.createFromTemplate('tmpl', 'Tmpl');
    await service.saveToLibrary('a');
    expect(withProjectWrite).toHaveBeenCalledTimes(1);

    withProjectWrite.mockClear();
    await writeDriverBundle(libraryDir, bundleOf('lib-one'));
    await service.addFromLibrary('lib-one');
    await service.delete('a', 'project');
    expect(withProjectWrite).toHaveBeenCalledTimes(2);

    withProjectWrite.mockClear();
    await service.delete('lib-one', 'library');
    await service.save(bundleOf('lib-two'), 'library');
    expect(withProjectWrite).not.toHaveBeenCalled();

    await service.adoptReferenced(projectDir);
    expect(withProjectWrite).toHaveBeenCalledTimes(1);
    withProjectWrite.mockClear();
    await service.reloadAfterRestore(projectDir);
    expect(withProjectWrite).not.toHaveBeenCalled();
  });

  it('requires an open project for project-scope writes', async () => {
    await registry.setProject(null);
    await expect(makeService().save(bundleOf('x'), 'project')).rejects.toThrow('No project is open');
  });
});
