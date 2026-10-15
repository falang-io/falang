// oxlint-disable init-declarations, max-lines, no-await-in-loop, no-empty-function, no-promise-executor-return, no-undefined, no-useless-undefined, consistent-function-scoping, numeric-separators-style -- test file: fixture-style helpers and fake-timer plumbing, not production code
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    startDebugSession: vi.fn(),
    setDebugBreakpoints: vi.fn(),
    resumeDebugSession: vi.fn(),
    stopDebugSession: vi.fn(),
    getDebugState: vi.fn(),
  },
}));
vi.mock('./api-client.js', () => ({ workflowApi: h.api }));
vi.mock('@falang/scheme', () => ({ getGlobalI18n: () => ({ t: (key: string) => `T:${key}` }) }));

const { TemporalDebugAdapter } = await import('./temporal-debug-adapter.js');
const { ApiCodedError } = await import('./api-coded-error.js');

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const loc = { documentId: 'd', nodeId: 'n' };
const entry = { functionName: 'main', args: [1] };

describe('TemporalDebugAdapter', () => {
  let ensureDevBuilt: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  let events: Record<string, unknown>[];
  let adapter: InstanceType<typeof TemporalDebugAdapter>;

  const startParams = (extra: Record<string, unknown> = {}) =>
    ({
      entry,
      breakpoints: [{ documentId: 'd', nodeId: 'n', extra: 1 }],
      pauseOnEntry: true,
      ...extra,
    }) as never;

  beforeEach(() => {
    vi.useFakeTimers();
    for (const fn of Object.values(h.api)) fn.mockReset();
    h.api.startDebugSession.mockResolvedValue({ workflowId: 'wf' });
    h.api.getDebugState.mockResolvedValue({ status: 'running' });
    ensureDevBuilt = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    adapter = new TemporalDebugAdapter('p1', { ensureDevBuilt });
    events = [];
    adapter.subscribe((event) => events.push(event as never));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start requires an entry', async () => {
    await expect(adapter.start({ breakpoints: [], pauseOnEntry: false } as never)).rejects.toThrow(/requires an entry/);
  });

  it('a failed build emits terminated(failed) and never starts a session', async () => {
    ensureDevBuilt.mockResolvedValue(false);
    await adapter.start(startParams());
    expect(h.api.startDebugSession).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'terminated', reason: 'failed', message: 'Failed to build the project for debugging' },
    ]);
  });

  it('start sends only breakpoint locations and the optional trigger payload, then emits started', async () => {
    await adapter.start(startParams());
    expect(h.api.startDebugSession).toHaveBeenCalledWith('p1', {
      functionName: 'main',
      args: [1],
      breakpoints: [loc],
      pauseOnEntry: true,
    });
    expect(events).toEqual([{ type: 'started' }]);

    await adapter.start(startParams({ entry: { ...entry, triggerPayload: { a: 1 } } }));
    expect(h.api.startDebugSession).toHaveBeenLastCalledWith(
      'p1',
      expect.objectContaining({ triggerPayload: { a: 1 } }),
    );
    await adapter.stop();
  });

  it('localises platform refusals (402/423) and rethrows others untouched', async () => {
    h.api.startDebugSession.mockRejectedValueOnce(
      new ApiCodedError('x', 'project_suspended', { code: 'project_suspended', reason: 'balance' }),
    );
    await expect(adapter.start(startParams())).rejects.toThrow('T:client:start-errors.suspended-balance');

    h.api.startDebugSession.mockRejectedValueOnce(new ApiCodedError('x', 'insufficient_balance'));
    await expect(adapter.start(startParams())).rejects.toThrow('T:client:start-errors.insufficient-balance');

    const plain = new Error('plain');
    h.api.startDebugSession.mockRejectedValueOnce(plain);
    await expect(adapter.start(startParams())).rejects.toBe(plain);
    expect(events).toEqual([]);
  });

  it('a refusal keeps its cause', async () => {
    const cause = new ApiCodedError('x', 'insufficient_balance');
    h.api.startDebugSession.mockRejectedValueOnce(cause);
    const thrown = await adapter.start(startParams()).catch((error: unknown) => error);
    expect((thrown as Error).cause).toBe(cause);
  });

  it('unsubscribe stops event delivery', async () => {
    const extra: unknown[] = [];
    const off = adapter.subscribe((event) => extra.push(event));
    off();
    await adapter.start(startParams());
    expect(extra).toEqual([]);
    expect(events).toHaveLength(1);
    await adapter.stop();
  });

  describe('polling', () => {
    it('emits paused with location, variables and a top-frame stack', async () => {
      h.api.getDebugState.mockResolvedValue({
        status: 'paused',
        location: loc,
        reason: 'breakpoint',
        variables: [{ name: 'x' }],
      });
      await adapter.start(startParams());
      await settle();
      expect(h.api.getDebugState).toHaveBeenCalledWith('p1', 'wf');
      expect(events[1]).toEqual({
        type: 'paused',
        location: loc,
        variables: [{ name: 'x' }],
        stack: [{ location: loc, functionName: 'd' }],
        reason: 'breakpoint',
      });
      await adapter.stop();
    });

    it('a paused snapshot without location or reason emits nothing but keeps polling', async () => {
      h.api.getDebugState.mockResolvedValueOnce({ status: 'paused' }).mockResolvedValue({ status: 'running' });
      await adapter.start(startParams());
      await settle();
      expect(events).toEqual([{ type: 'started' }]);
      await vi.advanceTimersByTimeAsync(500);
      expect(h.api.getDebugState).toHaveBeenCalledTimes(2);
      // wasPaused was set, so the following "running" reads as a resume
      expect(events).toContainEqual({ type: 'resumed' });
      await adapter.stop();
    });

    it('emits resumed once when a paused session runs again, not on every running poll', async () => {
      h.api.getDebugState
        .mockResolvedValueOnce({ status: 'paused', location: loc, reason: 'step', variables: [] })
        .mockResolvedValue({ status: 'running' });
      await adapter.start(startParams());
      await settle();
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);
      expect(events.filter((e) => e.type === 'resumed')).toHaveLength(1);
      await adapter.stop();
    });

    it('polls every 500ms and a runner-stopped snapshot is transient', async () => {
      h.api.getDebugState.mockResolvedValueOnce({ status: 'runner-stopped' }).mockResolvedValue({ status: 'running' });
      await adapter.start(startParams());
      await settle();
      expect(h.api.getDebugState).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(h.api.getDebugState).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.api.getDebugState).toHaveBeenCalledTimes(2);
      expect(events).toEqual([{ type: 'started' }]);
      await adapter.stop();
    });

    it('a failed poll is retried on the next tick', async () => {
      h.api.getDebugState.mockRejectedValueOnce(new Error('net')).mockResolvedValue({ status: 'running' });
      await adapter.start(startParams());
      await settle();
      await vi.advanceTimersByTimeAsync(500);
      expect(h.api.getDebugState).toHaveBeenCalledTimes(2);
      await adapter.stop();
    });

    it('a terminal status emits terminated, stops polling and detaches the session', async () => {
      h.api.getDebugState.mockResolvedValue({ status: 'completed', message: 'done' });
      await adapter.start(startParams());
      await settle();
      expect(events[1]).toEqual({ type: 'terminated', reason: 'completed', message: 'done' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(h.api.getDebugState).toHaveBeenCalledTimes(1);
      // no live session any more
      await adapter.resume('continue' as never);
      await adapter.setBreakpoints([]);
      await adapter.stop();
      expect(h.api.resumeDebugSession).not.toHaveBeenCalled();
      expect(h.api.setDebugBreakpoints).not.toHaveBeenCalled();
      expect(h.api.stopDebugSession).not.toHaveBeenCalled();
    });
  });

  describe('controls', () => {
    it('are no-ops without a session', async () => {
      await adapter.setBreakpoints([]);
      await adapter.resume('continue' as never);
      await adapter.stop();
      expect(h.api.setDebugBreakpoints).not.toHaveBeenCalled();
      expect(h.api.resumeDebugSession).not.toHaveBeenCalled();
      expect(h.api.stopDebugSession).not.toHaveBeenCalled();
    });

    it('forward breakpoints (locations only), resume mode and stop', async () => {
      await adapter.start(startParams());
      await adapter.setBreakpoints([{ documentId: 'd2', nodeId: 'n2', extra: 1 }] as never);
      expect(h.api.setDebugBreakpoints).toHaveBeenCalledWith('p1', 'wf', [{ documentId: 'd2', nodeId: 'n2' }]);
      await adapter.resume('step-over' as never);
      expect(h.api.resumeDebugSession).toHaveBeenCalledWith('p1', 'wf', 'step-over');
      await adapter.stop();
      expect(h.api.stopDebugSession).toHaveBeenCalledWith('p1', 'wf');
    });

    it('stop halts polling', async () => {
      await adapter.start(startParams());
      await settle();
      await adapter.stop();
      h.api.getDebugState.mockClear();
      await vi.advanceTimersByTimeAsync(5000);
      expect(h.api.getDebugState).not.toHaveBeenCalled();
    });

    it('a poll answer that lands after stop or a restart is dropped', async () => {
      let resolveState: (value: unknown) => void = () => {};
      h.api.getDebugState.mockImplementationOnce(() => new Promise((resolve) => (resolveState = resolve)));
      await adapter.start(startParams());
      await adapter.stop();
      resolveState({ status: 'paused', location: loc, reason: 'breakpoint', variables: [] });
      await settle();
      expect(events).toEqual([{ type: 'started' }]);
    });
  });
});
