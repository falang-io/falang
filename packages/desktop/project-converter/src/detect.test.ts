import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from '@falang/desktop-project-fs';
import { isOldFormatProject, OLD_SUPPORTED_VERSION, readOldManifest } from './detect.js';
import { copyFixtureToTmpDir } from './test-utils.js';

describe('detect', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('recognizes a real old-format project fixture', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    expect(await isOldFormatProject(projectDir)).toBe(true);
  });

  it('reads the old manifest', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    const manifest = await readOldManifest(projectDir);
    expect(manifest).toEqual({ name: '123123123', type: 'text', version: OLD_SUPPORTED_VERSION });
  });

  it('does not treat a new-format project as old', async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-converter-detect-new-'));
    await createProject(projectDir, { name: 'New', type: 'text' });
    expect(await isOldFormatProject(projectDir)).toBe(false);
  });

  it('does not treat an empty directory as old', async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-converter-detect-empty-'));
    expect(await isOldFormatProject(projectDir)).toBe(false);
  });

  it('rejects an unsupported old manifest version', async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-converter-detect-badversion-'));
    await fs.writeFile(
      path.join(projectDir, 'project.falangproject.json'),
      JSON.stringify({ name: 'X', type: 'text', version: 1 }),
    );
    await expect(readOldManifest(projectDir)).rejects.toThrow(/Unsupported old project version/);
  });
});
