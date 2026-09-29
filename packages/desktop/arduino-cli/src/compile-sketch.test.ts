import { describe, expect, it, vi } from 'vitest';
import { runArduinoCli } from './run-arduino-cli.js';
import { compileSketch } from './compile-sketch.js';

vi.mock('./run-arduino-cli.js', () => ({ runArduinoCli: vi.fn() }));

const mockedRunArduinoCli = vi.mocked(runArduinoCli);

describe('compileSketch', () => {
  it('runs arduino-cli compile with the given fqbn and sketch directory', async () => {
    mockedRunArduinoCli.mockResolvedValueOnce({ ok: true, output: 'Sketch uses 924 bytes' });

    const result = await compileSketch({ sketchDir: '/tmp/blink', fqbn: 'arduino:avr:uno' });

    expect(result).toEqual({ ok: true, output: 'Sketch uses 924 bytes' });
    expect(mockedRunArduinoCli).toHaveBeenCalledWith(['compile', '--fqbn', 'arduino:avr:uno', '/tmp/blink']);
  });
});
