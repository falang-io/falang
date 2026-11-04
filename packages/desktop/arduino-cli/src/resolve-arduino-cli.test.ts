// oxlint-disable consistent-function-scoping, no-await-expression-member -- test scaffolding
import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ARDUINO_CLI_SETTINGS_ENV, writeArduinoCliSettings } from './arduino-cli-settings.js';
import {
  ARDUINO_CLI_COMMAND,
  arduinoCliCandidates,
  resolveArduinoCli,
  resolveArduinoCliDetailed,
} from './resolve-arduino-cli.js';

describe('arduinoCliCandidates', () => {
  it('puts PATH entries first, then Homebrew and the Arduino IDE copy on macOS', () => {
    const candidates = arduinoCliCandidates({
      platform: 'darwin',
      env: { PATH: '/usr/bin:/bin' },
      homeDir: '/Users/u',
    });
    expect(candidates.slice(0, 4)).toEqual([
      '/usr/bin/arduino-cli',
      '/bin/arduino-cli',
      '/opt/homebrew/bin/arduino-cli',
      '/usr/local/bin/arduino-cli',
    ]);
    expect(candidates).toContain(
      '/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli',
    );
  });

  it('uses .exe, a semicolon PATH (spelled Path) and Windows install dirs', () => {
    const candidates = arduinoCliCandidates({
      platform: 'win32',
      env: {
        Path: String.raw`C:\Tools;D:\bin`,
        ProgramFiles: String.raw`C:\Program Files`,
        LOCALAPPDATA: String.raw`C:\Users\u\AppData\Local`,
      },
      homeDir: String.raw`C:\Users\u`,
    });
    expect(candidates).toEqual([
      String.raw`C:\Tools\arduino-cli.exe`,
      String.raw`D:\bin\arduino-cli.exe`,
      String.raw`C:\Program Files\Arduino CLI\arduino-cli.exe`,
      String.raw`C:\Users\u\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`,
      String.raw`C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`,
    ]);
  });

  it('deduplicates a well-known dir that is already on PATH', () => {
    const candidates = arduinoCliCandidates({ platform: 'linux', env: { PATH: '/usr/local/bin' }, homeDir: '/home/u' });
    expect(candidates.filter((c) => c === '/usr/local/bin/arduino-cli')).toHaveLength(1);
  });
});

describe('resolveArduinoCli', () => {
  const lookup = { platform: 'darwin' as const, env: { PATH: '/usr/bin' }, homeDir: '/Users/u' };

  it('returns the first candidate that exists', async () => {
    const found = await resolveArduinoCli(lookup, (candidate) =>
      Promise.resolve(candidate === '/opt/homebrew/bin/arduino-cli'),
    );
    expect(found).toBe('/opt/homebrew/bin/arduino-cli');
  });

  it('falls back to the bare command name when nothing is found', async () => {
    expect(await resolveArduinoCli(lookup, () => Promise.resolve(false))).toBe(ARDUINO_CLI_COMMAND);
  });

  it('uses FALANG_ARDUINO_CLI as-is without probing', async () => {
    const found = await resolveArduinoCli({ ...lookup, env: { FALANG_ARDUINO_CLI: '/custom/arduino-cli' } }, () =>
      Promise.reject(new Error('must not probe')),
    );
    expect(found).toBe('/custom/arduino-cli');
  });
});

describe('resolveArduinoCliDetailed', () => {
  const lookup = { platform: 'linux' as const, env: { PATH: '/usr/bin' }, homeDir: '/home/u' };
  let dir = '';
  let file = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'falang-cli-resolve-'));
    file = path.join(dir, 'arduino-cli.json');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const only = (target: string) => (candidate: string) => Promise.resolve(candidate === target);

  it('system: first candidate, or not-found with the bare name', async () => {
    expect(
      await resolveArduinoCliDetailed({ lookup, settingsFile: file, isExecutable: only('/usr/bin/arduino-cli') }),
    ).toEqual({
      path: '/usr/bin/arduino-cli',
      source: 'system',
    });
    expect(await resolveArduinoCliDetailed({ lookup, settingsFile: file, isExecutable: only('') })).toEqual({
      path: ARDUINO_CLI_COMMAND,
      source: 'system',
      problem: 'not-found',
    });
  });

  it('custom: uses the path when executable, else custom-missing without falling back to system', async () => {
    await writeArduinoCliSettings(file, { source: 'custom', customPath: '/my/cli' });
    expect(await resolveArduinoCliDetailed({ lookup, settingsFile: file, isExecutable: only('/my/cli') })).toEqual({
      path: '/my/cli',
      source: 'custom',
    });
    // the system copy exists, but must not be used
    expect(
      await resolveArduinoCliDetailed({ lookup, settingsFile: file, isExecutable: only('/usr/bin/arduino-cli') }),
    ).toEqual({ path: ARDUINO_CLI_COMMAND, source: 'custom', problem: 'custom-missing', missingPath: '/my/cli' });
  });

  it('managed: uses the installed path, else managed-missing without falling back', async () => {
    await writeArduinoCliSettings(file, {
      source: 'managed',
      managed: { version: '1.5.1', path: '/m/arduino-cli', installedAt: 'x' },
    });
    expect(
      await resolveArduinoCliDetailed({ lookup, settingsFile: file, isExecutable: only('/m/arduino-cli') }),
    ).toEqual({
      path: '/m/arduino-cli',
      source: 'managed',
    });
    expect(
      await resolveArduinoCliDetailed({ lookup, settingsFile: file, isExecutable: only('/usr/bin/arduino-cli') }),
    ).toEqual({
      path: ARDUINO_CLI_COMMAND,
      source: 'managed',
      problem: 'managed-missing',
      missingPath: '/m/arduino-cli',
    });
    await writeArduinoCliSettings(file, { source: 'managed' });
    expect(
      (await resolveArduinoCliDetailed({ lookup, settingsFile: file, isExecutable: () => Promise.resolve(true) }))
        .problem,
    ).toBe('managed-missing');
  });

  it('FALANG_ARDUINO_CLI wins over every source', async () => {
    await writeArduinoCliSettings(file, { source: 'custom', customPath: '/my/cli' });
    const result = await resolveArduinoCliDetailed({
      lookup: { ...lookup, env: { FALANG_ARDUINO_CLI: '/env/cli' } },
      settingsFile: file,
      isExecutable: () => Promise.reject(new Error('must not probe')),
    });
    expect(result).toEqual({ path: '/env/cli', source: 'env' });
  });

  it('reads the settings file from FALANG_ARDUINO_CLI_SETTINGS and re-reads it on every call', async () => {
    const env = { ...lookup.env, [ARDUINO_CLI_SETTINGS_ENV]: file };
    const options = { lookup: { ...lookup, env }, isExecutable: only('/my/cli') };
    expect((await resolveArduinoCliDetailed(options)).source).toBe('system');
    await writeArduinoCliSettings(file, { source: 'custom', customPath: '/my/cli' });
    expect(await resolveArduinoCliDetailed(options)).toEqual({ path: '/my/cli', source: 'custom' });
  });
});
