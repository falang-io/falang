import { describe, expect, it, vi } from 'vitest';
import { execFileAsync } from './exec-file-async.js';
import { runArduinoCli } from './run-arduino-cli.js';

vi.mock('./exec-file-async.js', () => ({ execFileAsync: vi.fn() }));

const mockedExecFileAsync = vi.mocked(execFileAsync);

describe('runArduinoCli', () => {
  it('joins stdout/stderr into output on success', async () => {
    mockedExecFileAsync.mockResolvedValueOnce({ ok: true, stdout: 'arduino-cli Version: 1.2.0', stderr: '' });

    const result = await runArduinoCli(['version']);

    expect(result).toEqual({ ok: true, output: 'arduino-cli Version: 1.2.0' });
    expect(mockedExecFileAsync).toHaveBeenCalledWith('arduino-cli', ['version']);
  });

  it('reports stderr text as output when the command fails', async () => {
    mockedExecFileAsync.mockResolvedValueOnce({
      ok: false,
      stdout: '',
      stderr: 'avr-gcc: error: unknown pin',
      errorMessage: 'Command failed with exit code 1',
    });

    const result = await runArduinoCli(['compile', '--fqbn', 'arduino:avr:uno', '/tmp/sketch']);

    expect(result).toEqual({ ok: false, output: 'avr-gcc: error: unknown pin' });
  });

  it('falls back to the error message when stdout/stderr are both empty', async () => {
    mockedExecFileAsync.mockResolvedValueOnce({
      ok: false,
      stdout: '',
      stderr: '',
      errorMessage: 'spawn arduino-cli ENOENT',
    });

    const result = await runArduinoCli(['version']);

    expect(result).toEqual({ ok: false, output: 'spawn arduino-cli ENOENT' });
  });
});
