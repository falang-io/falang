import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOGIC_EXPORT_CONFIG_FILENAME,
  logicExportConfigPath,
  readLogicExportConfiguration,
  writeLogicExportConfiguration,
} from './export-configuration-file.js';

describe('logic export configuration file', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logic-export-config-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('returns null for a project that was never configured', async () => {
    await expect(readLogicExportConfiguration(projectDir)).resolves.toBeNull();
  });

  it('round-trips a configuration through the on-disk file, under falang/config/', async () => {
    const config = {
      exports: [
        { language: 'cpp', path: './code/cpp' },
        { language: 'golang', path: '/abs/go' },
      ],
    } as const;
    await writeLogicExportConfiguration(projectDir, config);

    const configPath = logicExportConfigPath(projectDir);
    expect(configPath).toBe(path.join(projectDir, 'falang', 'config', LOGIC_EXPORT_CONFIG_FILENAME));
    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8'));
    expect(onDisk).toEqual(config);
    await expect(readLogicExportConfiguration(projectDir)).resolves.toEqual(config);
  });

  it('rejects a file with an unknown language or a malformed exports list', async () => {
    const filePath = logicExportConfigPath(projectDir);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ exports: [{ language: 'cobol', path: './x' }] }));
    await expect(readLogicExportConfiguration(projectDir)).rejects.toThrow(/"exports"/);

    await fs.writeFile(filePath, JSON.stringify({ exports: 'nope' }));
    await expect(readLogicExportConfiguration(projectDir)).rejects.toThrow(/"exports"/);

    await fs.writeFile(filePath, JSON.stringify('just a string'));
    await expect(readLogicExportConfiguration(projectDir)).rejects.toThrow(/not an object/);
  });

  it('migrates a legacy root logic-export.json into falang/config/ and reads it from there', async () => {
    const legacyPath = path.join(projectDir, LOGIC_EXPORT_CONFIG_FILENAME);
    const config = { exports: [{ language: 'rust', path: './code/rust' }] } as const;
    await fs.writeFile(legacyPath, JSON.stringify(config));

    await expect(readLogicExportConfiguration(projectDir)).resolves.toEqual(config);

    await expect(fs.access(legacyPath)).rejects.toThrow();
    const newPath = logicExportConfigPath(projectDir);
    expect(JSON.parse(await fs.readFile(newPath, 'utf8'))).toEqual(config);
  });

  it('prefers the new falang/config/ path over a legacy root file, when both exist', async () => {
    const legacyPath = path.join(projectDir, LOGIC_EXPORT_CONFIG_FILENAME);
    await fs.writeFile(legacyPath, JSON.stringify({ exports: [{ language: 'rust', path: './old' }] }));

    const newConfig = { exports: [{ language: 'cpp', path: './new' }] } as const;
    await writeLogicExportConfiguration(projectDir, newConfig);

    await expect(readLogicExportConfiguration(projectDir)).resolves.toEqual(newConfig);
    // The legacy file is untouched — migration only runs when the new path is missing.
    await expect(fs.access(legacyPath)).resolves.toBeUndefined();
  });
});
