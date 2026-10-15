// oxlint-disable init-declarations, max-lines, no-await-in-loop, no-empty-function, no-promise-executor-return, no-undefined, no-useless-undefined, consistent-function-scoping, numeric-separators-style -- test file: fixture-style helpers and fake-timer plumbing, not production code
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    startDevRun: vi.fn(),
    getRunPosition: vi.fn(),
    getWorkflowRunDetail: vi.fn(),
    terminateWorkflowRun: vi.fn(),
  },
  journals: [] as {
    source: unknown;
    fetchNew: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('./api-client.js', () => ({ workflowApi: h.api }));
vi.mock('@falang/scheme', () => ({ getGlobalI18n: () => ({ t: (key: string) => `T:${key}` }) }));
vi.mock('./run-journal-store.js', () => ({
  RunJournalStore: class {
    source: unknown;
    fetchNew = vi.fn().mockResolvedValue(0);
    dispose = vi.fn();
    constructor(source: unknown) {
      this.source = source;
      h.journals.push(this);
    }
  },
}));

const { LiveRunStore } = await import('./live-run-store.js');
const { ApiCodedError } = await import('./api-coded-error.js');
const { eventTracker } = await import('./analytics/event-tracker.js');

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const run = { workflowId: 'w', runId: 'r', workflowName: 'fn', env: 'dev' as const, version: 'dev' };
const pos = (status: string, stack: unknown[] = []) => ({ status, stack });

describe('LiveRunStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const fn of Object.values(h.api)) fn.mockReset();
    h.journals.length = 0;
    h.api.getRunPosition.mockResolvedValue(pos('RUNNING'));
    h.api.getWorkflowRunDetail.mockResolvedValue({ status: 'RUNNING' });
  });
  afterEach(() => {
    vi.useRealTimers();
    eventTracker.setHandler(null);
  });

  const make = (ensureDevBuilt = vi.fn().mockResolvedValue(true)) => ({
    store: new LiveRunStore('p1', { ensureDevBuilt }),
    ensureDevBuilt,
  });

  describe('startFunction', () => {
    it('builds, starts the run, follows it and tracks the event', async () => {
      const handler = { track: vi.fn() };
      eventTracker.setHandler(handler);
      h.api.startDevRun.mockResolvedValue({ workflowId: 'w1', runId: 'r1' });
      const { store, ensureDevBuilt } = make();
      await expect(store.startFunction('main', [1, 2])).resolves.toBe(true);
      expect(ensureDevBuilt).toHaveBeenCalled();
      expect(h.api.startDevRun).toHaveBeenCalledWith('p1', { functionName: 'main', args: [1, 2] });
      expect(store.watchedRun).toEqual({
        workflowId: 'w1',
        runId: 'r1',
        workflowName: 'main',
        env: 'dev',
        version: 'dev',
      });
      expect(store.isStarting).toBe(false);
      expect(handler.track).toHaveBeenCalledWith('run_started', undefined);
      store.dispose();
    });

    it('passes a trigger payload through', async () => {
      h.api.startDevRun.mockResolvedValue({ workflowId: 'w1', runId: 'r1' });
      const { store } = make();
      await store.startFunction('t', [], { text: 'hi' });
      expect(h.api.startDevRun).toHaveBeenCalledWith('p1', {
        functionName: 't',
        args: [],
        triggerPayload: { text: 'hi' },
      });
      store.dispose();
    });

    it('returns false without starting when the build failed', async () => {
      const { store } = make(vi.fn().mockResolvedValue(false));
      await expect(store.startFunction('main', [])).resolves.toBe(false);
      expect(h.api.startDevRun).not.toHaveBeenCalled();
      expect(store.watchedRun).toBeNull();
      expect(store.isStarting).toBe(false);
      expect(store.startError).toBeNull();
    });

    it('localises a platform refusal and reports other errors verbatim', async () => {
      const { store } = make();
      h.api.startDevRun.mockRejectedValueOnce(
        new ApiCodedError('x', 'project_suspended', { code: 'project_suspended', reason: 'admin' }),
      );
      await expect(store.startFunction('main', [])).resolves.toBe(false);
      expect(store.startError).toBe('T:client:start-errors.suspended-admin');
      expect(store.isStarting).toBe(false);

      h.api.startDevRun.mockRejectedValueOnce(new Error('boom'));
      await store.startFunction('main', []);
      expect(store.startError).toBe('boom');

      h.api.startDevRun.mockRejectedValueOnce('weird');
      await store.startFunction('main', []);
      expect(store.startError).toBe('Failed to start the run');
    });

    it('clears a previous startError on the next attempt', async () => {
      const { store } = make();
      h.api.startDevRun.mockRejectedValueOnce(new Error('boom'));
      await store.startFunction('main', []);
      h.api.startDevRun.mockResolvedValueOnce({ workflowId: 'w', runId: 'r' });
      await store.startFunction('main', []);
      expect(store.startError).toBeNull();
      store.dispose();
    });
  });

  describe('watching and polling', () => {
    it('polls position every 1s and history every 2s while the run is open', async () => {
      const { store } = make();
      store.watch(run);
      await settle();
      expect(h.api.getRunPosition).toHaveBeenCalledTimes(1);
      expect(h.api.getRunPosition).toHaveBeenCalledWith('p1', 'w', 'r');
      expect(h.api.getWorkflowRunDetail).toHaveBeenCalledWith('w', 'r', 'p1');
      expect(store.isOpen).toBe(true);

      await vi.advanceTimersByTimeAsync(1000);
      expect(h.api.getRunPosition).toHaveBeenCalledTimes(2);
      expect(h.api.getWorkflowRunDetail).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.api.getRunPosition).toHaveBeenCalledTimes(3);
      expect(h.api.getWorkflowRunDetail).toHaveBeenCalledTimes(2);
      store.dispose();
    });

    it('stops position polling once the run closes, with one last history fetch', async () => {
      h.api.getRunPosition.mockResolvedValueOnce(pos('RUNNING')).mockResolvedValue(pos('COMPLETED'));
      h.api.getWorkflowRunDetail
        .mockResolvedValueOnce({ status: 'RUNNING' })
        .mockResolvedValue({ status: 'COMPLETED' });
      const { store } = make();
      store.watch(run);
      await vi.advanceTimersByTimeAsync(5000);
      const positionCalls = h.api.getRunPosition.mock.calls.length;
      const historyCalls = h.api.getWorkflowRunDetail.mock.calls.length;
      expect(store.isOpen).toBe(false);
      expect(store.detail).toEqual({ status: 'COMPLETED' });
      await vi.advanceTimersByTimeAsync(20000);
      expect(h.api.getRunPosition.mock.calls.length).toBe(positionCalls);
      expect(h.api.getWorkflowRunDetail.mock.calls.length).toBe(historyCalls);
      expect(positionCalls).toBe(2);
      expect(historyCalls).toBe(2);
      store.dispose();
    });

    it('a failed position poll sets pollError and keeps polling; recovery clears it', async () => {
      h.api.getRunPosition.mockRejectedValueOnce(new Error('net')).mockResolvedValue(pos('RUNNING'));
      const { store } = make();
      store.watch(run);
      await settle();
      expect(store.pollError).toBe('net');
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.pollError).toBeNull();
      expect(store.position).toEqual(pos('RUNNING'));

      h.api.getRunPosition.mockRejectedValueOnce('x');
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.pollError).toBe('Failed to read the run position');
      store.dispose();
    });

    it('a failed history poll is silent and retried', async () => {
      h.api.getWorkflowRunDetail.mockRejectedValueOnce(new Error('x')).mockResolvedValue({ status: 'RUNNING' });
      const { store } = make();
      store.watch(run);
      await settle();
      expect(store.detail).toBeNull();
      expect(store.pollError).toBeNull();
      await vi.advanceTimersByTimeAsync(2000);
      expect(store.detail).toEqual({ status: 'RUNNING' });
      store.dispose();
    });

    it('drops answers that land after the watched run changed or was unwatched', async () => {
      let resolvePosition: (value: unknown) => void = () => {};
      h.api.getRunPosition.mockImplementationOnce(() => new Promise((resolve) => (resolvePosition = resolve)));
      const { store } = make();
      store.watch(run);
      store.unwatch();
      resolvePosition(pos('RUNNING', [{ documentId: 'd', nodeId: 'n' }]));
      await settle();
      expect(store.position).toBeNull();
      expect(store.watchedRun).toBeNull();
      await vi.advanceTimersByTimeAsync(10000);
      expect(h.api.getRunPosition).toHaveBeenCalledTimes(1);
    });

    it('switching to another run stops the previous one polling', async () => {
      const { store } = make();
      store.watch(run);
      await settle();
      store.watchSummary({ workflowId: 'w2', runId: 'r2', workflowName: 'other', env: 'prod', version: '3' } as never);
      expect(store.watchedRun).toEqual({
        workflowId: 'w2',
        runId: 'r2',
        workflowName: 'other',
        env: 'prod',
        version: '3',
      });
      await settle();
      h.api.getRunPosition.mockClear();
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.api.getRunPosition.mock.calls.every((c) => c[1] === 'w2')).toBe(true);
      expect(h.journals[0].dispose).toHaveBeenCalled();
      store.dispose();
    });

    it('dispose stops all timers and disposes the journal', async () => {
      const { store } = make();
      store.watch(run);
      await settle();
      store.dispose();
      expect(store.journal).toBeNull();
      expect(h.journals[0].dispose).toHaveBeenCalled();
      h.api.getRunPosition.mockClear();
      h.api.getWorkflowRunDetail.mockClear();
      await vi.advanceTimersByTimeAsync(20000);
      expect(h.api.getRunPosition).not.toHaveBeenCalled();
      expect(h.api.getWorkflowRunDetail).not.toHaveBeenCalled();
      expect(h.journals[0].fetchNew).toHaveBeenCalledTimes(1);
    });
  });

  describe('location', () => {
    it('is the innermost frame with a node', async () => {
      const { store } = make();
      expect(store.location).toBeNull();
      h.api.getRunPosition.mockResolvedValue(
        pos('RUNNING', [
          { documentId: 'a', nodeId: 'na' },
          { documentId: 'b', nodeId: 'nb' },
          { documentId: 'c', nodeId: null },
        ]),
      );
      store.watch(run);
      await settle();
      expect(store.location).toEqual({ documentId: 'b', nodeId: 'nb' });
      store.dispose();
    });

    it('is null when no frame carries a node', async () => {
      h.api.getRunPosition.mockResolvedValue(pos('RUNNING', [{ documentId: 'a', nodeId: null }]));
      const { store } = make();
      store.watch(run);
      await settle();
      expect(store.location).toBeNull();
      store.dispose();
    });
  });

  describe('journal', () => {
    it('creates a journal for the run and polls it on the history cadence, with two tail polls after close', async () => {
      h.api.getRunPosition.mockResolvedValue(pos('COMPLETED'));
      h.api.getWorkflowRunDetail.mockResolvedValue({ status: 'COMPLETED' });
      const { store } = make();
      store.watch(run);
      expect(h.journals[0].source).toEqual({ kind: 'run', projectId: 'p1', workflowId: 'w', runId: 'r' });
      await settle();
      const journal = h.journals[0];
      expect(journal.fetchNew).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(journal.fetchNew).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(journal.fetchNew).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(20000);
      expect(journal.fetchNew).toHaveBeenCalledTimes(3);
      store.dispose();
    });

    it('keeps polling the journal while the run is open', async () => {
      const { store } = make();
      store.watch(run);
      await vi.advanceTimersByTimeAsync(10000);
      expect(h.journals[0].fetchNew.mock.calls.length).toBeGreaterThanOrEqual(5);
      store.dispose();
    });
  });

  describe('terminateWatched', () => {
    it('does nothing without a watched run', async () => {
      const { store } = make();
      await store.terminateWatched();
      expect(h.api.terminateWorkflowRun).not.toHaveBeenCalled();
    });

    it('terminates and then re-reads the run', async () => {
      h.api.terminateWorkflowRun.mockResolvedValue(undefined);
      const { store } = make();
      store.watch(run);
      await settle();
      h.api.getRunPosition.mockClear();
      h.api.getRunPosition.mockResolvedValue(pos('TERMINATED'));
      await store.terminateWatched();
      expect(h.api.terminateWorkflowRun).toHaveBeenCalledWith('p1', 'w', 'r');
      await settle();
      expect(h.api.getRunPosition).toHaveBeenCalled();
      expect(store.position?.status).toBe('TERMINATED');
      store.dispose();
    });

    it('propagates an API failure to the caller', async () => {
      h.api.terminateWorkflowRun.mockRejectedValue(new Error('denied'));
      const { store } = make();
      store.watch(run);
      await expect(store.terminateWatched()).rejects.toThrow('denied');
      store.dispose();
    });
  });
});
