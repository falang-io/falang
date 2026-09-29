import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` factories are hoisted above every other statement — see `schedule-status-store.test.ts`/
// `files-store.test.ts` for the same `vi.hoisted` pattern.
const { listTasks, resolveTask } = vi.hoisted(() => ({
  listTasks: vi.fn(),
  resolveTask: vi.fn(),
}));
vi.mock('./api-client.js', () => ({
  workflowApi: {
    listTasks: (...args: unknown[]) => listTasks(...args),
    resolveTask: (...args: unknown[]) => resolveTask(...args),
  },
}));

const { TasksStore } = await import('./tasks-store.js');

const TASK_FIXTURE = {
  id: 'task-1',
  projectId: 'project-1',
  projectName: 'My project',
  env: 'dev' as const,
  workflowId: 'wf-1',
  runId: 'run-1',
  taskQueue: 'queue-1',
  nodeId: 'node-1',
  title: 'Approve refund',
  description: 'Approve or reject the refund',
  payload: { amount: 100 },
  attachments: [],
  options: [
    { label: 'Approve', dataType: 'void' as const },
    { label: 'Reject', dataType: 'string' as const, prompt: 'Reason' },
  ],
  status: 'open' as const,
  answer: null,
  answerData: null,
  resolvedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  dueAt: null,
  resolvedAt: null,
  orphanReason: null,
};

describe('TasksStore', () => {
  beforeEach(() => {
    listTasks.mockReset();
    resolveTask.mockReset();
  });

  it('loads the task list for the given filters', async () => {
    listTasks.mockResolvedValue([TASK_FIXTURE]);
    const store = new TasksStore();

    await store.load({ status: 'open', projectId: 'project-1' });

    expect(listTasks).toHaveBeenCalledWith({ status: 'open', projectId: 'project-1' });
    expect(store.tasks).toEqual([TASK_FIXTURE]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('resolve() replaces the resolved task in the list', async () => {
    listTasks.mockResolvedValue([TASK_FIXTURE]);
    const resolved = { ...TASK_FIXTURE, status: 'done' as const, answer: 'Approve', resolvedBy: 'user-1' };
    resolveTask.mockResolvedValue(resolved);
    const store = new TasksStore();
    await store.load();

    const result = await store.resolve('task-1', 'Approve');

    expect(resolveTask).toHaveBeenCalledWith('task-1', expect.objectContaining({ answer: 'Approve' }));
    expect(result).toEqual(resolved);
    expect(store.tasks).toEqual([resolved]);
  });

  it('openCount reflects only currently loaded open tasks', async () => {
    const doneTask = { ...TASK_FIXTURE, id: 'task-2', status: 'done' as const };
    listTasks.mockResolvedValue([TASK_FIXTURE, doneTask]);
    const store = new TasksStore();

    await store.load();

    expect(store.openCount).toBe(1);
  });

  it('records a load error without throwing', async () => {
    listTasks.mockRejectedValue(new Error('network down'));
    const store = new TasksStore();

    await store.load();

    expect(store.error).toBe('network down');
    expect(store.loading).toBe(false);
    expect(store.tasks).toEqual([]);
  });

  it('records a resolve error and rethrows it to the caller', async () => {
    listTasks.mockResolvedValue([TASK_FIXTURE]);
    resolveTask.mockRejectedValue(new Error('already resolved'));
    const store = new TasksStore();
    await store.load();

    await expect(store.resolve('task-1', 'Approve')).rejects.toThrow('already resolved');
    expect(store.error).toBe('already resolved');
  });

  describe('polling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('never polls unless start() is called', async () => {
      listTasks.mockResolvedValue([]);
      const store = new TasksStore();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(listTasks).not.toHaveBeenCalled();
      store.dispose();
    });

    it('polls the given filters every 30s once started', async () => {
      listTasks.mockResolvedValue([TASK_FIXTURE]);
      const store = new TasksStore();

      store.start({ status: 'open' });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(listTasks).toHaveBeenCalledTimes(1);
      expect(listTasks).toHaveBeenCalledWith({ status: 'open' });

      await vi.advanceTimersByTimeAsync(30_000);
      expect(listTasks).toHaveBeenCalledTimes(2);

      store.dispose();
    });

    it('stop() halts polling, and dispose() prevents any future poll', async () => {
      listTasks.mockResolvedValue([]);
      const store = new TasksStore();

      store.start();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(listTasks).toHaveBeenCalledTimes(1);

      store.stop();
      await vi.advanceTimersByTimeAsync(90_000);
      expect(listTasks).toHaveBeenCalledTimes(1);

      store.start();
      store.dispose();
      await vi.advanceTimersByTimeAsync(90_000);
      expect(listTasks).toHaveBeenCalledTimes(1);
    });
  });
});
