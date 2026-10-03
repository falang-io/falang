import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupOrphanedBuildDirs } from './build-artifact.js';

describe('cleanupOrphanedBuildDirs', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('removes only build-* directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'builds-'));
    roots.push(root);
    mkdirSync(join(root, 'build-abc123'));
    writeFileSync(join(root, 'build-abc123', 'workflows.ts'), 'x');
    mkdirSync(join(root, 'other-dir'));
    writeFileSync(join(root, 'build-file'), 'not a directory');

    expect(cleanupOrphanedBuildDirs(root)).toEqual(['build-abc123']);

    expect(existsSync(join(root, 'build-abc123'))).toBe(false);
    expect(existsSync(join(root, 'other-dir'))).toBe(true);
    expect(existsSync(join(root, 'build-file'))).toBe(true);
  });

  it('is a no-op when the output directory does not exist yet', () => {
    expect(cleanupOrphanedBuildDirs(join(tmpdir(), 'definitely-missing-builds-dir'))).toEqual([]);
  });
});
