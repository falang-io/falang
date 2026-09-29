import { assert, beforeEach, describe, it } from 'vitest';
import type {
  IDebugAdapter,
  IDebugBreakpoint,
  IDebugStartParams,
  TDebugEvent,
  TDebugEventListener,
  TDebugResumeMode,
} from '@falang/debug';
import { DebugSessionStore } from './debug-session.store.js';

/** Records every call and lets a test emit events by hand — no timers, unlike `FakeDebugAdapter`. */
class RecordingAdapter implements IDebugAdapter {
  readonly calls: string[] = [];
  breakpointSets: (readonly IDebugBreakpoint[])[] = [];
  startParams: IDebugStartParams | null = null;
  failNext: Error | null = null;
  private listener: TDebugEventListener | null = null;

  emit(event: TDebugEvent) {
    this.listener?.(event);
  }

  subscribe(listener: TDebugEventListener) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  start(params: IDebugStartParams) {
    this.calls.push('start');
    this.startParams = params;
    return this.maybeFail();
  }

  setBreakpoints(breakpoints: readonly IDebugBreakpoint[]) {
    this.calls.push('setBreakpoints');
    this.breakpointSets.push(breakpoints);
    return this.maybeFail();
  }

  resume(mode: TDebugResumeMode) {
    this.calls.push(`resume:${mode}`);
    return this.maybeFail();
  }

  stop() {
    this.calls.push('stop');
    return this.maybeFail();
  }

  private maybeFail(): Promise<void> {
    if (!this.failNext) return Promise.resolve();
    const error = this.failNext;
    this.failNext = null;
    return Promise.reject(error);
  }
}

const A = { documentId: 'doc-a', nodeId: 'n1' };
const B = { documentId: 'doc-b', nodeId: 'n2' };

describe('DebugSessionStore', () => {
  // oxlint-disable-next-line init-declarations
  let adapter: RecordingAdapter;
  // oxlint-disable-next-line init-declarations
  let session: DebugSessionStore;

  beforeEach(() => {
    adapter = new RecordingAdapter();
    session = new DebugSessionStore(adapter);
  });

  it('records breakpoints while idle without touching the adapter, and sends them on start', async () => {
    assert.equal(session.toggleBreakpoint(A), true);
    assert.equal(session.toggleBreakpoint(B), true);
    assert.equal(session.toggleBreakpoint(B), false);
    assert.deepEqual(adapter.calls, []);
    assert.deepEqual(session.breakpointList, [A]);
    assert.equal(session.hasBreakpoint(A), true);
    assert.deepEqual([...session.getBreakpointIds('doc-a')], ['n1']);
    assert.equal(session.getBreakpointIds('doc-b').size, 0);

    await session.start({ pauseOnEntry: true, entry: { fn: 'main' } });
    assert.deepEqual(adapter.calls, ['start']);
    assert.deepEqual(adapter.startParams, { breakpoints: [A], pauseOnEntry: true, entry: { fn: 'main' } });
    assert.equal(session.status, 'starting');
  });

  it('pushes the full breakpoint set to the adapter while a session is active', async () => {
    await session.start();
    adapter.emit({ type: 'started' });
    assert.equal(session.status, 'running');
    session.toggleBreakpoint(A);
    session.toggleBreakpoint(B);
    assert.deepEqual(adapter.calls, ['start', 'setBreakpoints', 'setBreakpoints']);
    assert.deepEqual(adapter.breakpointSets[1], [A, B]);
  });

  it('applies paused/resumed/terminated events', async () => {
    await session.start();
    adapter.emit({ type: 'started' });
    adapter.emit({
      type: 'paused',
      location: A,
      variables: [{ name: 'x', value: 1 }],
      stack: [{ location: A, functionName: 'main' }],
      reason: 'breakpoint',
    });
    assert.equal(session.status, 'paused');
    assert.deepEqual(session.pausedLocation, A);
    assert.deepEqual(session.variables, [{ name: 'x', value: 1 }]);
    assert.equal(session.pauseReason, 'breakpoint');

    await session.resume('step-over');
    assert.deepEqual(adapter.calls.at(-1), 'resume:step-over');
    adapter.emit({ type: 'resumed' });
    assert.equal(session.status, 'running');
    assert.equal(session.pausedLocation, null);
    assert.deepEqual(session.location, A);

    adapter.emit({ type: 'output', text: 'hello' });
    assert.deepEqual([...session.output], ['hello']);

    adapter.emit({ type: 'terminated', reason: 'completed' });
    assert.equal(session.status, 'terminated');
    assert.equal(session.terminationReason, 'completed');
    assert.equal(session.isActive, false);
  });

  it('ignores resume while not paused and stop while not active', async () => {
    await session.resume();
    await session.stop();
    await session.start();
    adapter.emit({ type: 'started' });
    await session.resume();
    assert.deepEqual(adapter.calls, ['start']);
    await session.stop();
    assert.deepEqual(adapter.calls, ['start', 'stop']);
  });

  it('turns an adapter failure into a failed termination with the message', async () => {
    adapter.failNext = new Error('runner unreachable');
    await session.start();
    assert.equal(session.status, 'terminated');
    assert.equal(session.terminationReason, 'failed');
    assert.equal(session.lastError, 'runner unreachable');
  });

  it('replaceBreakpoints restores a persisted set', () => {
    session.replaceBreakpoints([A, B, { documentId: 'doc-a', nodeId: 'n3' }]);
    assert.deepEqual([...session.getBreakpointIds('doc-a')], ['n1', 'n3']);
    assert.equal(session.hasBreakpoint(B), true);
    assert.deepEqual(adapter.calls, []);
  });
});
