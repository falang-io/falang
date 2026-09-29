import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDriverRegistry } from './driver-registry.js';

const writeDriver = async (
  driversDir: string,
  driverId: string,
  config: Record<string, unknown>,
  files: Record<string, string>,
): Promise<void> => {
  const dir = path.join(driversDir, driverId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'driver.config.json'), JSON.stringify(config));
  await Promise.all(
    Object.entries(files).map(([fileName, content]) => fs.writeFile(path.join(dir, fileName), content)),
  );
};

const validConfig = (id: string) => ({
  id,
  label: id,
  includes: [`${id}.h`],
  sourceFiles: [`${id}.h`, `${id}.cpp`],
  declarations: [`declare function ${id}_fn(): void;`],
  actions: [{ id: 'do-it', label: 'Do it', fields: [], codeTemplate: `${id}_fn()` }],
});

describe('loadDriverRegistry', () => {
  // oxlint-disable init-declarations
  let bundledDir: string;
  let userDir: string;

  beforeEach(async () => {
    bundledDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-drivers-bundled-'));
    userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-drivers-user-'));
  });

  afterEach(async () => {
    await fs.rm(bundledDir, { recursive: true, force: true });
    await fs.rm(userDir, { recursive: true, force: true });
  });

  it('loads a well-formed driver from the bundled directory', async () => {
    await writeDriver(bundledDir, 'dht', validConfig('dht'), { 'dht.h': '// h', 'dht.cpp': '// cpp' });

    const registry = await loadDriverRegistry(bundledDir, userDir);
    expect(registry.errors).toEqual([]);
    expect(registry.drivers).toHaveLength(1);
    expect(registry.drivers[0]?.config.id).toBe('dht');
    expect(registry.drivers[0]?.dir).toBe(path.join(bundledDir, 'dht'));
  });

  it('merges bundled and user drivers, letting a same-id user driver win', async () => {
    await writeDriver(bundledDir, 'dht', validConfig('dht'), { 'dht.h': '// h', 'dht.cpp': '// cpp' });
    await writeDriver(userDir, 'servo', validConfig('servo'), { 'servo.h': '// h', 'servo.cpp': '// cpp' });
    await writeDriver(
      userDir,
      'dht',
      { ...validConfig('dht'), label: 'Custom DHT' },
      {
        'dht.h': '// h',
        'dht.cpp': '// cpp',
      },
    );

    const registry = await loadDriverRegistry(bundledDir, userDir);
    expect(registry.errors).toEqual([]);
    const byId = new Map(registry.drivers.map((driver) => [driver.config.id, driver]));
    expect(byId.get('dht')?.config.label).toBe('Custom DHT');
    expect(byId.get('servo')?.config.label).toBe('servo');
  });

  it('skips a folder with an invalid driver.config.json, recording the error, without crashing', async () => {
    await writeDriver(bundledDir, 'dht', validConfig('dht'), { 'dht.h': '// h', 'dht.cpp': '// cpp' });
    await writeDriver(bundledDir, 'broken', { id: 'not kebab case!' }, {});

    const registry = await loadDriverRegistry(bundledDir, userDir);
    expect(registry.drivers.map((driver) => driver.config.id)).toEqual(['dht']);
    expect(registry.errors).toHaveLength(1);
    expect(registry.errors[0]?.dir).toBe(path.join(bundledDir, 'broken'));
  });

  it('skips a driver whose sourceFiles reference a file that does not exist on disk', async () => {
    // Deliberately missing dht.cpp — validConfig() lists it in sourceFiles but this test never writes it.
    await writeDriver(bundledDir, 'dht', validConfig('dht'), { 'dht.h': '// h' });

    const registry = await loadDriverRegistry(bundledDir, userDir);
    expect(registry.drivers).toEqual([]);
    expect(registry.errors).toHaveLength(1);
  });

  it('returns an empty registry when neither directory exists', async () => {
    const registry = await loadDriverRegistry(path.join(bundledDir, 'missing'), path.join(userDir, 'missing'));
    expect(registry).toEqual({ drivers: [], errors: [] });
  });
});
