import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';
import { FakeDebugAdapter, type IFakeDebugStep } from './fake-debug-adapter.js';
import type { TDebugEvent } from './protocol.js';

const DOC = 'doc-1';
const steps: IFakeDebugStep[] = [
  { location: { documentId: DOC, nodeId: 'a' }, variables: [{ name: 'x', value: 1 }] },
  { location: { documentId: DOC, nodeId: 'b' }, variables: [{ name: 'x', value: 2 }] },
  { location: { documentId: DOC, nodeId: 'c' } },
];

describe('FakeDebugAdapter', () => {
  // oxlint-disable-next-line init-declarations
  let adapter: FakeDebugAdapter;
  // oxlint-disable-next-line init-declarations
  let events: TDebugEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new FakeDebugAdapter({ getSteps: () => steps, stepDelayMs: 10 });
    events = [];
    adapter.subscribe((event) => events.push(event));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const types = () => events.map((event) => event.type);

  it('runs to completion with no breakpoints', async () => {
    await adapter.start({ breakpoints: [], pauseOnEntry: false });
    assert.deepEqual(types(), ['started']);
    await vi.advanceTimersByTimeAsync(10 * (steps.length + 1));
    assert.deepEqual(types(), ['started', 'terminated']);
    assert.deepEqual(events.at(-1), { type: 'terminated', reason: 'completed' });
  });

  it('pauses on entry, then step-over visits every statement', async () => {
    await adapter.start({ breakpoints: [], pauseOnEntry: true });
    assert.deepEqual(types(), ['started', 'paused']);
    const first = events[1];
    if (first.type !== 'paused') throw new Error('expected paused');
    assert.equal(first.location.nodeId, 'a');
    assert.equal(first.reason, 'entry');
    assert.deepEqual(first.variables, [{ name: 'x', value: 1 }]);

    await adapter.resume('step-over');
    await vi.advanceTimersByTimeAsync(10);
    const second = events.at(-1);
    if (second?.type !== 'paused') throw new Error('expected paused');
    assert.equal(second.location.nodeId, 'b');
    assert.equal(second.reason, 'step');

    await adapter.resume('step-over');
    await vi.advanceTimersByTimeAsync(10);
    await adapter.resume('step-over');
    await vi.advanceTimersByTimeAsync(10);
    assert.deepEqual(events.at(-1), { type: 'terminated', reason: 'completed' });
  });

  it('pauses at a breakpoint set at start and at one set live', async () => {
    await adapter.start({ breakpoints: [{ documentId: DOC, nodeId: 'b' }], pauseOnEntry: false });
    await vi.advanceTimersByTimeAsync(20);
    const paused = events.at(-1);
    if (paused?.type !== 'paused') throw new Error('expected paused');
    assert.equal(paused.location.nodeId, 'b');
    assert.equal(paused.reason, 'breakpoint');

    await adapter.setBreakpoints([{ documentId: DOC, nodeId: 'c' }]);
    await adapter.resume('continue');
    assert.equal(events.at(-1)?.type, 'resumed');
    await vi.advanceTimersByTimeAsync(10);
    const pausedAgain = events.at(-1);
    if (pausedAgain?.type !== 'paused') throw new Error('expected paused');
    assert.equal(pausedAgain.location.nodeId, 'c');
  });

  it('stop terminates a running session and ignores later timers', async () => {
    await adapter.start({ breakpoints: [], pauseOnEntry: false });
    await adapter.stop();
    assert.deepEqual(events.at(-1), { type: 'terminated', reason: 'stopped' });
    await vi.advanceTimersByTimeAsync(100);
    assert.equal(events.length, 2);
  });

  it('resume/stop are no-ops before start', async () => {
    await adapter.resume('continue');
    await adapter.stop();
    assert.deepEqual(events, []);
  });
});
