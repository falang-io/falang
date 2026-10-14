import type { TDebugEvent } from '@falang/debug';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArduinoDebugAdapter } from './arduino-debug-adapter.js';

const stubFalang = (debugStart: () => Promise<void>): void => {
  vi.stubGlobal('falang', {
    arduino: {
      uploadDebug: () =>
        Promise.resolve({ stage: 'cli', result: { ok: true, output: '' }, debugMap: { tracePoints: [] } }),
    },
    debug: { start: debugStart, onEvent: () => vi.fn() },
  });
};

describe('ArduinoDebugAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ends the session as failed when the serial port cannot be opened', async () => {
    stubFalang(() => Promise.reject(new Error('Error: No such file or directory, cannot open /dev/ttyACM0')));
    const adapter = new ArduinoDebugAdapter({ getProjectDir: () => '/p', getDocuments: () => [] });
    const events: TDebugEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    await adapter.start({
      entry: { fqbn: 'arduino:avr:uno', port: '/dev/ttyACM0' },
      breakpoints: [],
      pauseOnEntry: false,
    });

    expect(events).toEqual([
      {
        type: 'terminated',
        reason: 'failed',
        message: 'Could not open /dev/ttyACM0: Error: No such file or directory, cannot open /dev/ttyACM0',
      },
    ]);
  });
});
