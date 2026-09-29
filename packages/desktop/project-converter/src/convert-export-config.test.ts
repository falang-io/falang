import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { convertOldProject } from './convert-project.js';
import { isOldFormatProject } from './detect.js';
import { copyFixtureToTmpDir } from './test-utils.js';

/**
 * Covers `convert-export-config.ts`'s conversion of the old app's own `falang/config/export.json`
 * into the new project's `falang/config/logic-export.json` — split out of `convert-project.test.ts`
 * to keep that file under the repo's `max-lines` lint budget (see its own doc comment for the rest
 * of `convertOldProject`'s coverage).
 */
describe('convertOldProject — export configuration', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  afterEach(async () => {
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("converts the old app's own falang/config/export.json into falang/config/logic-export.json", async () => {
    projectDir = await copyFixtureToTmpDir('objects');
    await fs.mkdir(path.join(projectDir, 'falang', 'config'), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'falang', 'config', 'export.json'),
      JSON.stringify({
        exports: [
          { language: 'ts', path: './code/ts/src/falang' },
          { language: 'rust', path: './code/rust/src/falang' },
        ],
      }),
    );

    await convertOldProject(projectDir);

    const written = await fs.readFile(path.join(projectDir, 'falang', 'config', 'logic-export.json'), 'utf8');
    expect(JSON.parse(written)).toEqual({
      exports: [
        { language: 'ts', path: './code/ts/src/falang' },
        { language: 'rust', path: './code/rust/src/falang' },
      ],
    });
  });

  it('writes no logic-export.json when the old project has no export.json', async () => {
    projectDir = await copyFixtureToTmpDir('objects');

    await convertOldProject(projectDir);

    await expect(fs.access(path.join(projectDir, 'falang', 'config', 'logic-export.json'))).rejects.toThrow();
  });

  it('rejects an old export.json with an unrecognized language, naming the file, and rolls back', async () => {
    projectDir = await copyFixtureToTmpDir('objects');
    await fs.mkdir(path.join(projectDir, 'falang', 'config'), { recursive: true });
    const badExportPath = path.join(projectDir, 'falang', 'config', 'export.json');
    await fs.writeFile(badExportPath, JSON.stringify({ exports: [{ language: 'cobol', path: './code' }] }));

    await expect(convertOldProject(projectDir)).rejects.toThrow(/Invalid logic export configuration.*export\.json/);

    expect(await isOldFormatProject(projectDir)).toBe(true);
    expect(await fs.readdir(projectDir)).not.toContain('backup');
  });
});
