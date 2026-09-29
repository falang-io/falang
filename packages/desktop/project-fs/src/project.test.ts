import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, openProject } from './project.js';
import { isV3FormatProject, migrateV3Project } from './migrate-v3.js';
import { documentsDir, manifestPath } from './paths.js';
import { FORMAT_VERSION } from './types.js';

describe('project', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-test-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('creates an empty project manifest with a falang/schemes directory', async () => {
    const manifest = await createProject(projectDir, { name: 'My Project', type: 'text' });

    expect(manifest).toEqual({
      name: 'My Project',
      type: 'text',
      formatVersion: FORMAT_VERSION,
      folders: [],
      documents: [],
    });
    const documentsStat = await fs.stat(documentsDir(projectDir));
    expect(documentsStat.isDirectory()).toBe(true);
  });

  it('round-trips through openProject', async () => {
    await createProject(projectDir, { name: 'My Project', type: 'text' });
    const opened = await openProject(projectDir);
    expect(opened).toEqual({
      name: 'My Project',
      type: 'text',
      formatVersion: FORMAT_VERSION,
      folders: [],
      documents: [],
    });
  });

  it('rejects a manifest missing required fields', async () => {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(manifestPath(projectDir), JSON.stringify({ name: 'broken', type: 'text' }));
    await expect(openProject(projectDir)).rejects.toThrow(/formatVersion/);
  });

  describe('refuses to overwrite an existing project', () => {
    it('rejects when a current-format falang.json already exists', async () => {
      await createProject(projectDir, { name: 'first', type: 'text' });
      await expect(createProject(projectDir, { name: 'second', type: 'text' })).rejects.toThrow(
        /already exists.*falang\.json/,
      );
    });

    it('rejects when a v3-format project.json already exists', async () => {
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'project.json'), '{}');
      await expect(createProject(projectDir, { name: 'x', type: 'text' })).rejects.toThrow(
        /already exists.*project\.json/,
      );
    });

    it('rejects when an old-format project.falangproject.json already exists', async () => {
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'project.falangproject.json'), '{}');
      await expect(createProject(projectDir, { name: 'x', type: 'text' })).rejects.toThrow(
        /already exists.*project\.falangproject\.json/,
      );
    });

    it('still creates a project directory that does not exist yet', async () => {
      const freshDir = path.join(projectDir, 'nested', 'new-project');
      const manifest = await createProject(freshDir, { name: 'Nested', type: 'text' });
      expect(manifest.name).toBe('Nested');
      const stat = await fs.stat(manifestPath(freshDir));
      expect(stat.isFile()).toBe(true);
    });
  });

  describe('v3 → v4 migration', () => {
    /** Writes a v3-format project by hand: `project.json` manifest + `documents/<id>.json`. */
    const writeV3Fixture = async (): Promise<void> => {
      await fs.mkdir(path.join(projectDir, 'documents'), { recursive: true });
      await fs.writeFile(
        path.join(projectDir, 'project.json'),
        JSON.stringify(
          {
            name: 'Old Layout',
            type: 'text',
            formatVersion: 3,
            folders: [],
            documents: [{ id: 'x', type: 'contour', name: 'x', folderId: null }],
          },
          null,
          2,
        ),
      );
      await fs.writeFile(
        path.join(projectDir, 'documents', 'x.json'),
        JSON.stringify({ id: 'x', type: 'contour', name: 'x', root: { id: 'x-root', name: 'contour' } }),
      );
    };

    it('isV3FormatProject recognizes a v3 fixture and not a fresh v4 project', async () => {
      await writeV3Fixture();
      expect(await isV3FormatProject(projectDir)).toBe(true);

      const freshDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-v4-test-'));
      try {
        await createProject(freshDir, { name: 'Fresh', type: 'text' });
        expect(await isV3FormatProject(freshDir)).toBe(false);
      } finally {
        await fs.rm(freshDir, { recursive: true, force: true });
      }
    });

    it('migrateV3Project moves the manifest and documents into the v4 layout', async () => {
      await writeV3Fixture();
      await migrateV3Project(projectDir);

      expect(await fs.readdir(projectDir)).not.toContain('documents');
      expect(await fs.readdir(projectDir)).not.toContain('project.json');

      const manifest = JSON.parse(await fs.readFile(manifestPath(projectDir), 'utf8')) as {
        formatVersion: number;
        name: string;
      };
      expect(manifest.formatVersion).toBe(4);
      expect(manifest.name).toBe('Old Layout');

      const migratedDoc = JSON.parse(await fs.readFile(path.join(documentsDir(projectDir), 'x.json'), 'utf8')) as {
        id: string;
      };
      expect(migratedDoc.id).toBe('x');
    });

    it('openProject migrates a v3 project automatically before reading it', async () => {
      await writeV3Fixture();

      const manifest = await openProject(projectDir);
      expect(manifest).toEqual({
        name: 'Old Layout',
        type: 'text',
        formatVersion: 4,
        folders: [],
        documents: [{ id: 'x', type: 'contour', name: 'x', folderId: null }],
      });
      expect(await fs.readdir(projectDir)).not.toContain('documents');
      expect(await fs.readdir(projectDir)).not.toContain('project.json');
    });
  });
});
