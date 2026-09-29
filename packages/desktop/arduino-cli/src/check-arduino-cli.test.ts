import { describe, expect, it, vi } from 'vitest';
import { runArduinoCli } from './run-arduino-cli.js';
import { checkArduinoCli } from './check-arduino-cli.js';

vi.mock('./run-arduino-cli.js', () => ({ runArduinoCli: vi.fn() }));

const mockedRunArduinoCli = vi.mocked(runArduinoCli);

describe('checkArduinoCli', () => {
  it('reports available with a trimmed version when arduino-cli responds', async () => {
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: true, output: 'arduino-cli Version: 1.2.0\n' });

    const status = await checkArduinoCli();

    expect(status).toEqual({ available: true, version: 'arduino-cli Version: 1.2.0' });
    expect(mockedRunArduinoCli).toHaveBeenCalledWith(['version']);
  });

  it('reports unavailable when arduino-cli is not on PATH', async () => {
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: false, output: 'spawn arduino-cli ENOENT' });

    const status = await checkArduinoCli();

    expect(status).toEqual({ available: false });
  });
});
