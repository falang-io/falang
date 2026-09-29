import { describe, expect, it, vi } from 'vitest';
import { runArduinoCli } from './run-arduino-cli.js';
import { uploadSketch } from './upload-sketch.js';

vi.mock('./run-arduino-cli.js', () => ({ runArduinoCli: vi.fn() }));

const mockedRunArduinoCli = vi.mocked(runArduinoCli);

describe('uploadSketch', () => {
  it('runs arduino-cli compile --upload (never a bare upload, which only flashes a stale cached build) with the given fqbn, port, and sketch directory', async () => {
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: true, output: 'Writing | 100%' });

    const result = await uploadSketch({ sketchDir: '/tmp/blink', fqbn: 'arduino:avr:uno', port: '/dev/ttyUSB0' });

    expect(result).toEqual({ ok: true, output: 'Writing | 100%' });
    expect(mockedRunArduinoCli).toHaveBeenCalledWith([
      'compile',
      '--upload',
      '--fqbn',
      'arduino:avr:uno',
      '--port',
      '/dev/ttyUSB0',
      '/tmp/blink',
    ]);
  });
});
