import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moveOldProjectIntoBackup, restoreProjectFromBackup } from './backup.js';
import { copyFixtureToTmpDir } from './test-utils.js';

const readFileTree = async (dir: string): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};
  const walk = async (current: string, relative: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const relPath = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return walk(path.join(current, entry.name), relPath);
        result[relPath] = await fs.readFile(path.join(current, entry.name), 'utf8');
      }),
    );
  };
  await walk(dir, '');
  return result;
};

describe('moveOldProjectIntoBackup', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('moves the falang-owned entries into backup/ (the "text" fixture has no other entries, so the project directory ends up empty)', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    const before = await readFileTree(projectDir);

    const backupDir = await moveOldProjectIntoBackup(projectDir);

    expect(await fs.readdir(projectDir)).toEqual(['backup']);
    const after = await readFileTree(backupDir);
    expect(after).toEqual(before);
  });

  it('uses backup2/backup3/... when backup/ already exists', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    await fs.mkdir(path.join(projectDir, 'backup'));
    await fs.mkdir(path.join(projectDir, 'backup2'));

    const backupDir = await moveOldProjectIntoBackup(projectDir);

    expect(backupDir).toBe(path.join(projectDir, 'backup3'));
  });

  it('moves only the falang-owned entries, leaving non-falang entries at the project root untouched', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    await fs.writeFile(path.join(projectDir, 'README.md'), 'hand-written host project readme');
    await fs.mkdir(path.join(projectDir, 'code', 'ts'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'code', 'ts', 'index.ts'), 'export {};');

    const backupDir = await moveOldProjectIntoBackup(projectDir);

    expect(await fs.readdir(projectDir).then((entries) => entries.sort())).toEqual(['README.md', 'backup', 'code']);
    expect(await fs.readFile(path.join(projectDir, 'code', 'ts', 'index.ts'), 'utf8')).toBe('export {};');
    expect(await fs.readdir(backupDir).then((entries) => entries.sort())).toEqual([
      'falang',
      'project.falangproject.json',
    ]);
  });
});

describe('restoreProjectFromBackup', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('undoes moveOldProjectIntoBackup, discarding whatever partial output sits alongside backup/', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    const before = await readFileTree(projectDir);

    const backupDir = await moveOldProjectIntoBackup(projectDir);
    // Simulate a conversion that got partway through before failing.
    await fs.writeFile(path.join(projectDir, 'falang.json'), '{"partial":true}');
    await fs.mkdir(path.join(projectDir, 'falang', 'schemes'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'falang', 'schemes', 'stray.json'), '{}');

    await restoreProjectFromBackup(projectDir, backupDir);

    expect(await fs.readdir(projectDir)).not.toContain('backup');
    expect(
      await fs.access(backupDir).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(await readFileTree(projectDir)).toEqual(before);
  });

  it('leaves non-falang entries at the project root untouched throughout backup + restore', async () => {
    projectDir = await copyFixtureToTmpDir('text');
    await fs.writeFile(path.join(projectDir, 'README.md'), 'hand-written host project readme');
    await fs.mkdir(path.join(projectDir, 'code', 'ts'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'code', 'ts', 'index.ts'), 'export {};');
    const before = await readFileTree(projectDir);

    const backupDir = await moveOldProjectIntoBackup(projectDir);
    // Simulate a conversion that got partway through before failing (new-format output only).
    await fs.writeFile(path.join(projectDir, 'falang.json'), '{"partial":true}');
    await fs.mkdir(path.join(projectDir, 'falang', 'schemes'), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'falang', 'schemes', 'stray.json'), '{}');

    await restoreProjectFromBackup(projectDir, backupDir);

    expect(await readFileTree(projectDir)).toEqual(before);
    expect(await fs.readFile(path.join(projectDir, 'code', 'ts', 'index.ts'), 'utf8')).toBe('export {};');
  });
});
