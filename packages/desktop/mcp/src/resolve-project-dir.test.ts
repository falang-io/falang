import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MANIFEST_FILENAME } from '@falang/desktop-project-fs';
import { resolveProjectDir } from './resolve-project-dir.js';

describe('resolveProjectDir', () => {
  // oxlint-disable-next-line init-declarations
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'resolve-project-dir-test-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns the directory itself when it has a falang.json', async () => {
    await fs.writeFile(path.join(root, MANIFEST_FILENAME), '{}');
    await expect(resolveProjectDir(root)).resolves.toBe(root);
  });

  it('walks up from a subdirectory to find the nearest falang.json', async () => {
    await fs.writeFile(path.join(root, MANIFEST_FILENAME), '{}');
    const nested = path.join(root, 'falang', 'schemes', 'sub');
    await fs.mkdir(nested, { recursive: true });
    await expect(resolveProjectDir(nested)).resolves.toBe(root);
  });

  it('throws when no ancestor has a falang.json', async () => {
    const nested = path.join(root, 'no-project-here');
    await fs.mkdir(nested, { recursive: true });
    await expect(resolveProjectDir(nested)).rejects.toThrow(/No falang project found/);
  });
});
