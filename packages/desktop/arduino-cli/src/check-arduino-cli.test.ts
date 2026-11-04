import { describe, expect, it, vi } from 'vitest';
import { runArduinoCli } from './run-arduino-cli.js';
import { checkArduinoCli, parseArduinoCliVersion } from './check-arduino-cli.js';

vi.mock('./run-arduino-cli.js', () => ({ runArduinoCli: vi.fn() }));
vi.mock('./resolve-arduino-cli.js', () => ({
  resolveArduinoCliDetailed: vi.fn(() => Promise.resolve({ path: '/opt/homebrew/bin/arduino-cli', source: 'system' })),
}));

// The real native addon is loaded here (it has a prebuild for every OS the tests run on).
const serialMonitorSupported = true;

const mockedRunArduinoCli = vi.mocked(runArduinoCli);

describe('checkArduinoCli', () => {
  it('reports available with the JSON VersionString when arduino-cli responds', async () => {
    mockedRunArduinoCli.mockResolvedValueOnce({
      ok: true,
      output: '{"Application":"arduino-cli","VersionString":"1.5.1","Commit":"x"}\n',
    });

    const status = await checkArduinoCli();

    expect(status).toEqual({
      available: true,
      version: '1.5.1',
      path: '/opt/homebrew/bin/arduino-cli',
      source: 'system',
      serialMonitorSupported,
    });
    expect(mockedRunArduinoCli).toHaveBeenCalledWith(['version', '--json']);
  });

  it('reports unavailable when arduino-cli cannot be found', async () => {
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: false, output: 'spawn arduino-cli ENOENT' });

    const status = await checkArduinoCli();

    expect(status).toEqual({ available: false, source: 'system', serialMonitorSupported });
  });

  it('falls back to the trimmed text when the output is not JSON', () => {
    expect(parseArduinoCliVersion('arduino-cli Version: 1.2.0\n')).toBe('arduino-cli Version: 1.2.0');
    expect(parseArduinoCliVersion('{"x":1}')).toBe('{"x":1}');
  });
});
