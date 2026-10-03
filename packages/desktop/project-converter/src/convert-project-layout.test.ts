// oxlint-disable no-await-in-loop
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { convertOldProject } from './convert-project.js';
import { copyFixtureToTmpDir } from './test-utils.js';

describe('convertOldProject on-disk layout', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it.each(['arrays', 'objects'])(
    'keeps scheme names as file names and the folder structure on disk for the "%s" fixture (format v5)',
    async (fixture) => {
      projectDir = await copyFixtureToTmpDir(fixture);
      const oldSchemasDir = path.join(projectDir, 'falang', 'schemas');
      const oldRelPaths: string[] = [];
      const walk = async (dir: string): Promise<void> => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          // oxlint-disable-next-line no-await-in-loop
          if (entry.isDirectory()) await walk(full);
          else if (entry.name.endsWith('.falang.json'))
            oldRelPaths.push(path.relative(oldSchemasDir, full).replace(/\.falang\.json$/, '.json'));
        }
      };
      await walk(oldSchemasDir);
      expect(oldRelPaths.some((rel) => rel.includes(path.sep))).toBe(true);

      await convertOldProject(projectDir);

      const newSchemesDir = path.join(projectDir, 'falang', 'schemes');
      const newRelPaths: string[] = [];
      const walkNew = async (dir: string): Promise<void> => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          // oxlint-disable-next-line no-await-in-loop
          if (entry.isDirectory()) await walkNew(full);
          else newRelPaths.push(path.relative(newSchemesDir, full));
        }
      };
      await walkNew(newSchemesDir);
      // Exactly the old files, same folders, same names — no flat `<id>.json` left.
      expect(newRelPaths.toSorted()).toEqual(oldRelPaths.toSorted());

      const manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'falang.json'), 'utf8')) as {
        formatVersion: number;
        folders: { dirName?: string }[];
        documents: { fileName?: string }[];
      };
      expect(manifest.formatVersion).toBe(5);
      expect(manifest.folders.every((folder) => typeof folder.dirName === 'string')).toBe(true);
      expect(manifest.documents.every((doc) => typeof doc.fileName === 'string')).toBe(true);
    },
  );
});
