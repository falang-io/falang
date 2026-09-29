import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { IPortMonitor } from '@falang/desktop-arduino-cli';
import type { IDebugMap, TDebugEvent } from '@falang/debug';
import { SerialDebugSession } from './serial-debug-session.js';

const DEBUG_MAP: IDebugMap = {
  tracePoints: [
    { index: 0, documentId: 'doc-1', nodeId: 'n0', variables: [{ name: 'x', type: 'int' }] },
    { index: 1, documentId: 'doc-1', nodeId: 'n1', variables: [] },
  ],
};

const fakeMonitor = (): { monitor: IPortMonitor; written: string[] } => {
  const stdout = new PassThrough();
  const written: string[] = [];
  const stdin = new PassThrough();
  stdin.on('data', (chunk: Buffer) => written.push(chunk.toString('utf8')));
  return { monitor: { stdin, stdout, kill: vi.fn(() => stdout.destroy()) }, written };
};

const emitLines = (stream: PassThrough, ...lines: string[]): void => {
  for (const line of lines) stream.write(`${line}\n`);
};

describe('SerialDebugSession', () => {
  it('on "R": sends every staged breakpoint then attaches, and emits started', () => {
    const { monitor, written } = fakeMonitor();
    const events: TDebugEvent[] = [];
    expect(
      new SerialDebugSession({
        monitor,
        debugMap: DEBUG_MAP,
        breakpoints: [{ documentId: 'doc-1', nodeId: 'n0' }],
        pauseOnEntry: false,
        onEvent: (event) => events.push(event),
      }),
    ).toBeInstanceOf(SerialDebugSession);

    emitLines(monitor.stdout as PassThrough, 'R');

    expect(written).toEqual(['B 0 1\n', 'A\n']);
    expect(events).toEqual([{ type: 'started' }]);
  });

  it('resolves a pause once every declared variable for that trace point has arrived, reason "breakpoint"', () => {
    const { monitor } = fakeMonitor();
    const events: TDebugEvent[] = [];
    expect(
      new SerialDebugSession({
        monitor,
        debugMap: DEBUG_MAP,
        breakpoints: [{ documentId: 'doc-1', nodeId: 'n0' }],
        pauseOnEntry: false,
        onEvent: (event) => events.push(event),
      }),
    ).toBeInstanceOf(SerialDebugSession);

    emitLines(monitor.stdout as PassThrough, 'R', 'P 0 1', 'V 0 i 42');

    expect(events).toEqual([
      { type: 'started' },
      {
        type: 'paused',
        location: { documentId: 'doc-1', nodeId: 'n0' },
        variables: [{ name: 'x', type: 'int', value: 42 }],
        stack: [{ location: { documentId: 'doc-1', nodeId: 'n0' }, functionName: 'doc-1' }],
        reason: 'breakpoint',
      },
    ]);
  });

  it('a trace point with no declared variables pauses immediately, no V line needed', () => {
    const { monitor } = fakeMonitor();
    const events: TDebugEvent[] = [];
    expect(
      new SerialDebugSession({
        monitor,
        debugMap: DEBUG_MAP,
        breakpoints: [{ documentId: 'doc-1', nodeId: 'n1' }],
        pauseOnEntry: false,
        onEvent: (event) => events.push(event),
      }),
    ).toBeInstanceOf(SerialDebugSession);

    emitLines(monitor.stdout as PassThrough, 'R', 'P 1 1');

    expect(events.at(-1)).toMatchObject({ type: 'paused', reason: 'breakpoint' });
  });

  it('the very first pause reports reason "entry" when pauseOnEntry was requested, even without a real breakpoint', () => {
    const { monitor, written } = fakeMonitor();
    const events: TDebugEvent[] = [];
    expect(
      new SerialDebugSession({
        monitor,
        debugMap: DEBUG_MAP,
        breakpoints: [],
        pauseOnEntry: true,
        onEvent: (event) => events.push(event),
      }),
    ).toBeInstanceOf(SerialDebugSession);

    emitLines(monitor.stdout as PassThrough, 'R');
    expect(written).toEqual(['B 0 1\n', 'A\n']);

    emitLines(monitor.stdout as PassThrough, 'P 0 1', 'V 0 i 7');
    expect(events.at(-1)).toMatchObject({ type: 'paused', reason: 'entry' });
  });

  it('resume(mode) sends C or S', async () => {
    const { monitor, written } = fakeMonitor();
    const session = new SerialDebugSession({
      monitor,
      debugMap: DEBUG_MAP,
      breakpoints: [],
      pauseOnEntry: false,
      onEvent: () => {
        // ignored — not the assertion under test
      },
    });

    await session.resume('continue');
    await session.resume('step-over');

    expect(written).toEqual(['C\n', 'S\n']);
  });

  it('setBreakpoints sends only the diff against the current set', async () => {
    const { monitor, written } = fakeMonitor();
    const session = new SerialDebugSession({
      monitor,
      debugMap: DEBUG_MAP,
      breakpoints: [{ documentId: 'doc-1', nodeId: 'n0' }],
      pauseOnEntry: false,
      onEvent: () => {
        // ignored — not the assertion under test
      },
    });
    written.length = 0;

    await session.setBreakpoints([{ documentId: 'doc-1', nodeId: 'n1' }]);

    expect(written).toEqual(['B 0 0\n', 'B 1 1\n']);
  });

  it('stop() kills the monitor and emits terminated "stopped" exactly once', async () => {
    const { monitor } = fakeMonitor();
    const events: TDebugEvent[] = [];
    const session = new SerialDebugSession({
      monitor,
      debugMap: DEBUG_MAP,
      breakpoints: [],
      pauseOnEntry: false,
      onEvent: (event) => events.push(event),
    });

    await session.stop();
    await session.stop();

    expect(monitor.kill).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'terminated', reason: 'stopped' }]);
  });

  it('the underlying process closing on its own (no stop() call) emits terminated "completed"', async () => {
    const { monitor } = fakeMonitor();
    const events: TDebugEvent[] = [];
    expect(
      new SerialDebugSession({
        monitor,
        debugMap: DEBUG_MAP,
        breakpoints: [],
        pauseOnEntry: false,
        onEvent: (event) => events.push(event),
      }),
    ).toBeInstanceOf(SerialDebugSession);

    (monitor.stdout as PassThrough).destroy();
    await new Promise((resolveTick) => {
      setImmediate(resolveTick);
    });

    expect(events).toEqual([{ type: 'terminated', reason: 'completed' }]);
  });
});
