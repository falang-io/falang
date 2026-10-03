import { describe, expect, it } from 'vitest';
import { ARDUINO_CLI_COMMAND, arduinoCliCandidates, resolveArduinoCli } from './resolve-arduino-cli.js';

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
