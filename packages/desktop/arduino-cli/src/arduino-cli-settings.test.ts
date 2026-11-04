import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARDUINO_CLI_SETTINGS_ENV,
  DEFAULT_ARDUINO_CLI_SETTINGS,
  getArduinoCliSettingsFile,
  readArduinoCliSettings,
  setArduinoCliSettingsFile,
  writeArduinoCliSettings,
} from './arduino-cli-settings.js';

describe('arduino-cli settings file', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'falang-cli-settings-'));
  });
  afterEach(async () => {
    setArduinoCliSettingsFile(null);
    await rm(dir, { recursive: true, force: true });
  });

  it('defaults to system when the file is missing, corrupt or the wrong shape', async () => {
    const file = path.join(dir, 'a.json');
    expect(await readArduinoCliSettings(file)).toEqual(DEFAULT_ARDUINO_CLI_SETTINGS);
    await writeFile(file, '{not json', 'utf8');
    expect(await readArduinoCliSettings(file)).toEqual(DEFAULT_ARDUINO_CLI_SETTINGS);
    await writeFile(file, JSON.stringify({ source: 'bogus' }), 'utf8');
    expect(await readArduinoCliSettings(file)).toEqual(DEFAULT_ARDUINO_CLI_SETTINGS);
    await writeFile(file, '[]', 'utf8');
    expect(await readArduinoCliSettings(file)).toEqual(DEFAULT_ARDUINO_CLI_SETTINGS);
  });

  it('round-trips atomically, creating the parent directory and leaving no temp file', async () => {
    const file = path.join(dir, 'nested', 'arduino-cli.json');
    const settings = {
      source: 'managed' as const,
      managed: { version: '1.5.1', path: '/x/arduino-cli', installedAt: '2026-11-04T00:00:00Z' },
      checkUpdates: false,
      lastUpdateCheck: { at: '2026-11-04T00:00:00Z', latest: '1.5.1' },
    };
    await writeArduinoCliSettings(file, settings);
    expect(await readArduinoCliSettings(file)).toEqual(settings);
    expect(await readdir(path.dirname(file))).toEqual(['arduino-cli.json']);
  });

  it('drops malformed optional fields', async () => {
    const file = path.join(dir, 'b.json');
    await writeFile(file, JSON.stringify({ source: 'custom', customPath: '/c', managed: { version: 1 } }), 'utf8');
    expect(await readArduinoCliSettings(file)).toEqual({ source: 'custom', customPath: '/c' });
  });

  it('prefers the explicit file, then the environment variable', () => {
    expect(getArduinoCliSettingsFile({})).toBeNull();
    expect(getArduinoCliSettingsFile({ [ARDUINO_CLI_SETTINGS_ENV]: '/env.json' })).toBe('/env.json');
    setArduinoCliSettingsFile('/set.json');
    expect(getArduinoCliSettingsFile({ [ARDUINO_CLI_SETTINGS_ENV]: '/env.json' })).toBe('/set.json');
  });
});
