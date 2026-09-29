import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeSketchFiles } from './sketch-files.js';

describe('writeSketchFiles', () => {
  // oxlint-disable-next-line init-declarations
  let buildDir: string;

  beforeEach(async () => {
    buildDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-cli-test-'));
  });

  afterEach(async () => {
    await fs.rm(buildDir, { recursive: true, force: true });
  });

  it('writes the sketch under <buildDir>/<sketchName>/<sketchName>.ino', async () => {
    const sketchDir = await writeSketchFiles(buildDir, 'blink', 'void setup() {}\nvoid loop() {}\n');

    expect(sketchDir).toBe(path.join(buildDir, 'blink'));
    const code = await fs.readFile(path.join(sketchDir, 'blink.ino'), 'utf8');
    expect(code).toBe('void setup() {}\nvoid loop() {}\n');
  });

  it('overwrites an existing sketch file on a second call', async () => {
    await writeSketchFiles(buildDir, 'blink', 'first');
    const sketchDir = await writeSketchFiles(buildDir, 'blink', 'second');

    const code = await fs.readFile(path.join(sketchDir, 'blink.ino'), 'utf8');
    expect(code).toBe('second');
  });

  it('writes an in-memory extraFiles entry (content) alongside the .ino', async () => {
    const sketchDir = await writeSketchFiles(buildDir, 'blink', 'code', [
      { relativePath: 'falang_debug.h', content: '// debug header' },
    ]);

    const written = await fs.readFile(path.join(sketchDir, 'falang_debug.h'), 'utf8');
    expect(written).toBe('// debug header');
  });

  it('copies extraFiles into the sketch directory alongside the .ino', async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-cli-driver-source-'));
    try {
      await fs.writeFile(path.join(sourceDir, 'driver.h'), '// header');
      const sketchDir = await writeSketchFiles(buildDir, 'blink', 'code', [
        { relativePath: 'driver.h', sourcePath: path.join(sourceDir, 'driver.h') },
      ]);

      const copied = await fs.readFile(path.join(sketchDir, 'driver.h'), 'utf8');
      expect(copied).toBe('// header');
    } finally {
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });

  it('removes a stale file left over from a previous build inside the sketch dir, but leaves files outside it alone', async () => {
    const sketchDir = await writeSketchFiles(buildDir, 'blink', 'first', [
      { relativePath: 'old-driver.h', content: '// stale driver' },
    ]);
    const siblingPath = path.join(buildDir, 'sibling.txt');
    await fs.writeFile(siblingPath, 'untouched');

    await writeSketchFiles(buildDir, 'blink', 'second');

    await expect(fs.readFile(path.join(sketchDir, 'old-driver.h'), 'utf8')).rejects.toThrow();
    const sibling = await fs.readFile(siblingPath, 'utf8');
    expect(sibling).toBe('untouched');
  });
});
