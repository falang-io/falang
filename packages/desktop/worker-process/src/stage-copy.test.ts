import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stageCopy } from './stage-copy.js';

describe('stageCopy', () => {
  // oxlint-disable-next-line init-declarations
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'stage-copy-test-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('copies a file into the destination directory', async () => {
    const source = path.join(root, 'src', 'index.js');
    await fs.mkdir(path.dirname(source));
    await fs.writeFile(source, 'v1');

    const destDir = await stageCopy({ source, destDir: path.join(root, 'out', 'mcp-server'), stamp: '1.0.0' });

    expect(await fs.readFile(path.join(destDir, 'index.js'), 'utf8')).toBe('v1');
  });

  it('copies a directory tree and replaces it only when the stamp changes', async () => {
    const source = path.join(root, 'drivers');
    await fs.mkdir(path.join(source, 'dht'), { recursive: true });
    await fs.writeFile(path.join(source, 'dht', 'driver.config.json'), 'v1');
    const destDir = path.join(root, 'out', 'drivers');

    await stageCopy({ source, destDir, stamp: '1.0.0' });
    await fs.writeFile(path.join(source, 'dht', 'driver.config.json'), 'v2');
    await stageCopy({ source, destDir, stamp: '1.0.0' });
    expect(await fs.readFile(path.join(destDir, 'dht', 'driver.config.json'), 'utf8')).toBe('v1');

    await fs.rm(path.join(source, 'dht'), { recursive: true });
    await fs.mkdir(path.join(source, 'servo'));
    await fs.writeFile(path.join(source, 'servo', 'driver.config.json'), 's');
    await stageCopy({ source, destDir, stamp: '1.1.0' });
    expect(await fs.readdir(destDir)).toEqual(expect.arrayContaining(['servo']));
    expect(await fs.readdir(destDir)).not.toContain('dht');
  });
});
