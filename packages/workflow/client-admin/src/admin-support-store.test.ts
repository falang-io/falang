import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listSupportThreads: vi.fn(),
  listSupportMessages: vi.fn(),
  markSupportThreadRead: vi.fn(),
  replyToSupportThread: vi.fn(),
  getSupportUnread: vi.fn(),
}));
vi.mock('./admin-api.js', () => ({ adminApi: api }));

const { AdminSupportStore } = await import('./admin-support-store.js');

const msg = (id: string, authorRole: 'user' | 'admin', readAt: string | null = null) => ({
  id,
  authorRole,
  readAt,
  text: id,
  createdAt: '2026-01-01T00:00:00Z',
});

const flush = async (n = 10): Promise<void> => {
  await Promise.resolve();
  if (n > 0) await flush(n - 1);
};

describe('AdminSupportStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(api).forEach((f) => f.mockReset());
    api.listSupportThreads.mockResolvedValue([]);
    api.listSupportMessages.mockResolvedValue([]);
    api.markSupportThreadRead.mockResolvedValue(null);
    api.getSupportUnread.mockResolvedValue({ count: 3 });
  });
  afterEach(() => vi.useRealTimers());

  it('polls unread every 15s until stopped, and start is idempotent', async () => {
    const store = new AdminSupportStore();
    store.startUnreadPolling();
    store.startUnreadPolling();
    await flush();
    expect(api.getSupportUnread).toHaveBeenCalledTimes(1);
    expect(store.unreadTotal).toBe(3);

    await vi.advanceTimersByTimeAsync(14_999);
    expect(api.getSupportUnread).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.getSupportUnread).toHaveBeenCalledTimes(2);

    store.stopUnreadPolling();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.getSupportUnread).toHaveBeenCalledTimes(2);
  });

  it('keeps polling unread after a transient failure', async () => {
    api.getSupportUnread.mockRejectedValueOnce(new Error('x'));
    const store = new AdminSupportStore();
    store.startUnreadPolling();
    await flush();
    expect(store.unreadTotal).toBe(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(store.unreadTotal).toBe(3);
    store.stopUnreadPolling();
  });

  it('page polling refreshes threads and the selected conversation every 15s', async () => {
    const store = new AdminSupportStore();
    store.startPagePolling();
    await flush();
    expect(api.listSupportThreads).toHaveBeenCalledTimes(1);
    expect(api.listSupportMessages).not.toHaveBeenCalled();

    await store.select('u1');
    api.listSupportMessages.mockClear();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(api.listSupportMessages).toHaveBeenCalledWith('u1');
    store.stopPagePolling();
    api.listSupportThreads.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.listSupportThreads).not.toHaveBeenCalled();
  });

  it('select marks the thread read only when it has unread user messages', async () => {
    const store = new AdminSupportStore();
    api.listSupportMessages.mockResolvedValueOnce([msg('a', 'user', null)]);
    await store.select('u1');
    expect(api.markSupportThreadRead).toHaveBeenCalledWith('u1');
    expect(store.messages.map((m) => m.id)).toEqual(['a']);
    expect(api.getSupportUnread).toHaveBeenCalled();

    api.markSupportThreadRead.mockClear();
    api.listSupportMessages.mockResolvedValueOnce([msg('a', 'user', 'x'), msg('b', 'admin', null)]);
    await store.select('u1');
    expect(api.markSupportThreadRead).not.toHaveBeenCalled();
  });

  it('ignores a conversation response for a thread that is no longer selected', async () => {
    const store = new AdminSupportStore();
    const deferred = Promise.withResolvers<unknown>();
    api.listSupportMessages.mockReturnValueOnce(deferred.promise);
    const first = store.select('u1');
    api.listSupportMessages.mockResolvedValueOnce([msg('b', 'admin', null)]);
    await store.select('u2');
    deferred.resolve([msg('a', 'user', null)]);
    await first;
    expect(store.selectedUserId).toBe('u2');
    expect(store.messages.map((m) => m.id)).toEqual(['b']);
    expect(api.markSupportThreadRead).not.toHaveBeenCalled();
  });

  it('records an error when the conversation fails to load', async () => {
    api.listSupportMessages.mockRejectedValueOnce(new Error('boom'));
    const store = new AdminSupportStore();
    await store.select('u1');
    expect(store.error).toBe('boom');
  });

  it('records an error when threads fail to load', async () => {
    api.listSupportThreads.mockRejectedValueOnce('nope');
    const store = new AdminSupportStore();
    await store.refreshThreads();
    expect(store.error).toBe('Failed to load conversations');
  });

  describe('reply', () => {
    it('does nothing without a selection or with blank text', async () => {
      const store = new AdminSupportStore();
      await store.reply('hi');
      store.selectedUserId = 'u1';
      await store.reply('   ');
      expect(api.replyToSupportThread).not.toHaveBeenCalled();
    });

    it('appends the message once and refreshes threads', async () => {
      const store = new AdminSupportStore();
      await store.select('u1');
      api.replyToSupportThread.mockResolvedValue(msg('r1', 'admin'));
      api.listSupportThreads.mockClear();
      await store.reply('hello');
      expect(api.replyToSupportThread).toHaveBeenCalledWith('u1', 'hello');
      expect(store.messages.map((m) => m.id)).toEqual(['r1']);
      expect(api.listSupportThreads).toHaveBeenCalled();
      expect(store.sending).toBe(false);
    });

    it('does not duplicate a message the poll already delivered', async () => {
      const store = new AdminSupportStore();
      api.listSupportMessages.mockResolvedValue([msg('r1', 'admin')]);
      await store.select('u1');
      api.replyToSupportThread.mockResolvedValue(msg('r1', 'admin'));
      await store.reply('hello');
      expect(store.messages).toHaveLength(1);
    });

    it('stores the error, resets sending and rethrows on failure', async () => {
      const store = new AdminSupportStore();
      await store.select('u1');
      api.replyToSupportThread.mockRejectedValue(new Error('denied'));
      await expect(store.reply('x')).rejects.toThrow('denied');
      expect(store.error).toBe('denied');
      expect(store.sending).toBe(false);
    });
  });
});
