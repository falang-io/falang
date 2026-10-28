import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getSupportUnread: vi.fn(),
  listSupportMessages: vi.fn(),
  markSupportRead: vi.fn(),
  sendSupportMessage: vi.fn(),
}));
const auth = vi.hoisted(() => ({ currentUser: { id: 'u' } as unknown }));
vi.mock('./api-client.js', () => ({ workflowApi: api }));
vi.mock('./auth-store.js', () => ({ authStore: auth }));

const { SupportStore } = await import('./support-store.js');

const msg = (id: string, authorRole: 'user' | 'admin' = 'admin', readAt: string | null = null, createdAt = id) =>
  ({ id, authorRole, readAt, createdAt, text: id }) as never;

describe('SupportStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(api).forEach((f) => f.mockReset());
    auth.currentUser = { id: 'u' };
    api.getSupportUnread.mockResolvedValue({ count: 2 });
    api.listSupportMessages.mockResolvedValue([]);
    api.markSupportRead.mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

  describe('unread polling and refcount', () => {
    it('starts on the first holder only and polls every 60s', async () => {
      const store = new SupportStore();
      store.acquire();
      store.acquire();
      await vi.advanceTimersByTimeAsync(0);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(1);
      expect(store.unreadCount).toBe(2);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(2);
      store.release();
      store.release();
    });

    it('keeps polling until the last holder releases', async () => {
      const store = new SupportStore();
      store.acquire();
      store.acquire();
      await vi.advanceTimersByTimeAsync(0);
      store.release();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(2);
      store.release();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(2);
    });

    it('does not go negative on a stray release, and re-acquire restarts polling', async () => {
      const store = new SupportStore();
      store.release();
      store.acquire();
      await vi.advanceTimersByTimeAsync(0);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(1);
      store.release();
    });

    it('skips the request when signed out or when the chat is open, yet keeps the timer', async () => {
      const store = new SupportStore();
      auth.currentUser = null;
      store.acquire();
      await vi.advanceTimersByTimeAsync(0);
      expect(api.getSupportUnread).not.toHaveBeenCalled();
      auth.currentUser = { id: 'u' };
      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(1);
      await store.open();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.getSupportUnread).toHaveBeenCalledTimes(1);
      store.release();
    });

    it('survives a failed poll', async () => {
      api.getSupportUnread.mockRejectedValueOnce(new Error('x'));
      const store = new SupportStore();
      store.acquire();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.unreadCount).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(store.unreadCount).toBe(2);
      store.release();
    });

    it('releasing the last holder closes the chat and stops message polling', async () => {
      const store = new SupportStore();
      store.acquire();
      await store.open();
      expect(store.chatOpen).toBe(true);
      store.release();
      expect(store.chatOpen).toBe(false);
      api.listSupportMessages.mockClear();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(api.listSupportMessages).not.toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    it('open loads everything, marks read and clears the badge', async () => {
      api.listSupportMessages.mockResolvedValue([msg('a')]);
      const store = new SupportStore();
      store.unreadCount = 5;
      await store.open();
      expect(api.listSupportMessages).toHaveBeenCalledWith(null);
      expect(api.markSupportRead).toHaveBeenCalledOnce();
      expect(store.unreadCount).toBe(0);
      expect(store.messages.map((m) => m.id)).toEqual(['a']);
      store.close();
    });

    it('polls every 10s after the newest known message and marks read only for new unread admin messages', async () => {
      api.listSupportMessages.mockResolvedValueOnce([msg('a', 'admin', 'r', '2026-01-01')]);
      const store = new SupportStore();
      await store.open();
      api.markSupportRead.mockClear();

      api.listSupportMessages.mockResolvedValueOnce([msg('u', 'user', null, '2026-01-02')]);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(api.listSupportMessages).toHaveBeenLastCalledWith('2026-01-01');
      expect(api.markSupportRead).not.toHaveBeenCalled();

      api.listSupportMessages.mockResolvedValueOnce([msg('b', 'admin', null, '2026-01-03')]);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(api.listSupportMessages).toHaveBeenLastCalledWith('2026-01-02');
      expect(api.markSupportRead).toHaveBeenCalledOnce();
      expect(store.messages.map((m) => m.id)).toEqual(['a', 'u', 'b']);
      store.close();
    });

    it('does not duplicate messages that are returned twice', async () => {
      api.listSupportMessages.mockResolvedValue([msg('a', 'admin', 'r')]);
      const store = new SupportStore();
      await store.open();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(store.messages).toHaveLength(1);
      store.close();
    });

    it('records a load error and keeps polling', async () => {
      api.listSupportMessages.mockRejectedValueOnce(new Error('offline'));
      const store = new SupportStore();
      await store.open();
      expect(store.error).toBe('offline');
      api.listSupportMessages.mockResolvedValue([msg('a', 'admin', 'r')]);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(store.messages).toHaveLength(1);
      store.close();
    });

    it('uses a fallback message for non-Error failures', async () => {
      api.listSupportMessages.mockRejectedValueOnce('x');
      const store = new SupportStore();
      await store.open();
      expect(store.error).toBe('Failed to load messages');
      store.close();
    });

    it('close stops the message poll', async () => {
      const store = new SupportStore();
      await store.open();
      store.close();
      api.listSupportMessages.mockClear();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(api.listSupportMessages).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('ignores blank text', async () => {
      const store = new SupportStore();
      await store.send('  ');
      expect(api.sendSupportMessage).not.toHaveBeenCalled();
    });

    it('sends trimmed text and merges the reply', async () => {
      api.sendSupportMessage.mockResolvedValue(msg('m1', 'user'));
      const store = new SupportStore();
      await store.send('  hi ');
      expect(api.sendSupportMessage).toHaveBeenCalledWith('hi');
      expect(store.messages.map((m) => m.id)).toEqual(['m1']);
      expect(store.sending).toBe(false);
    });

    it('stores the error, resets sending and rethrows', async () => {
      api.sendSupportMessage.mockRejectedValue(new Error('rate'));
      const store = new SupportStore();
      await expect(store.send('hi')).rejects.toThrow('rate');
      expect(store.error).toBe('rate');
      expect(store.sending).toBe(false);
    });

    it('uses a fallback message for non-Error failures', async () => {
      api.sendSupportMessage.mockRejectedValue('x');
      const store = new SupportStore();
      await expect(store.send('hi')).rejects.toBe('x');
      expect(store.error).toBe('Failed to send message');
    });
  });
});
