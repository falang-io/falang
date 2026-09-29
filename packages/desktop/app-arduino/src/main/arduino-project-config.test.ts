import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configFilePath } from '@falang/desktop-project-fs';
import { readArduinoProjectConfig, writeArduinoProjectConfig } from './arduino-project-config.js';

describe('arduino-project-config (ADR 0032 (private), task A)', () => {
  let projectDir = '';

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-arduino-project-config-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('reads null when the project has no arduino.json yet', async () => {
    await expect(readArduinoProjectConfig(projectDir)).resolves.toBeNull();
  });

  it('writes and round-trips the board through falang/config/arduino.json', async () => {
    await writeArduinoProjectConfig(projectDir, { board: 'arduino:avr:mega' });
    await expect(readArduinoProjectConfig(projectDir)).resolves.toEqual({ board: 'arduino:avr:mega' });

    const raw = JSON.parse(await fs.readFile(configFilePath(projectDir, 'arduino.json'), 'utf8')) as unknown;
    expect(raw).toEqual({ board: 'arduino:avr:mega' });
  });

  it('creates falang/config/ if it does not exist yet (an older project may not have it)', async () => {
    await writeArduinoProjectConfig(projectDir, { board: 'arduino:avr:uno' });
    await expect(fs.access(configFilePath(projectDir, 'arduino.json'))).resolves.toBeUndefined();
  });

  it('reads a corrupt (unparsable) file as null rather than throwing', async () => {
    const filePath = configFilePath(projectDir, 'arduino.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'not json');
    await expect(readArduinoProjectConfig(projectDir)).resolves.toBeNull();
  });

  it('reads a structurally invalid file (missing "board") as null', async () => {
    const filePath = configFilePath(projectDir, 'arduino.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ notBoard: 'x' }));
    await expect(readArduinoProjectConfig(projectDir)).resolves.toBeNull();
  });
});
