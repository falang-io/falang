import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocumentLocks } = vi.hoisted(() => ({ getDocumentLocks: vi.fn() }));
vi.mock('./api-client.js', () => ({ workflowApi: { getDocumentLocks: (...a: unknown[]) => getDocumentLocks(...a) } }));

const { DocumentLocksStore } = await import('./document-locks-store.js');

describe('DocumentLocksStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getDocumentLocks.mockReset();
    getDocumentLocks.mockResolvedValue([{ documentId: 'd1', expiresAt: 'T1' }]);
  });
  afterEach(() => vi.useRealTimers());

  it('loads locks immediately, replaces them on each poll (5s) and notifies', async () => {
    const onChange = vi.fn();
    const store = new DocumentLocksStore('p1', onChange);
    await vi.advanceTimersByTimeAsync(0);
    expect(getDocumentLocks).toHaveBeenCalledWith('p1');
    expect(store.isLocked('d1')).toBe(true);
    expect(store.lockExpiresAt('d1')).toBe('T1');
    expect(store.lockExpiresAt('d2')).toBeUndefined();
    expect(onChange).toHaveBeenCalledTimes(1);

    getDocumentLocks.mockResolvedValue([{ documentId: 'd2', expiresAt: 'T2' }]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.isLocked('d1')).toBe(false);
    expect(store.isLocked('d2')).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
    store.dispose();
  });

  it('records a poll error, keeps the last locks and keeps polling', async () => {
    const store = new DocumentLocksStore('p1');
    await vi.advanceTimersByTimeAsync(0);
    getDocumentLocks.mockRejectedValueOnce(new Error('down'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.pollError).toBe('down');
    expect(store.isLocked('d1')).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.pollError).toBeNull();
    store.dispose();
  });

  it('uses a fallback message for a non-Error rejection', async () => {
    getDocumentLocks.mockRejectedValue('x');
    const store = new DocumentLocksStore('p1');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.pollError).toBe('Failed to read document locks');
    store.dispose();
  });

  it('markLockedFromConflict locks at once, records the conflict and notifies', async () => {
    const onChange = vi.fn();
    const store = new DocumentLocksStore('p1', onChange);
    await vi.advanceTimersByTimeAsync(0);
    onChange.mockClear();
    store.markLockedFromConflict('d9', 'T9');
    expect(store.isLocked('d9')).toBe(true);
    expect(store.lastConflict).toMatchObject({ documentId: 'd9', lockExpiresAt: 'T9' });
    expect(onChange).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it('dispose stops polling and ignores an in-flight response', async () => {
    const deferred = Promise.withResolvers<unknown>();
    getDocumentLocks.mockReturnValueOnce(deferred.promise);
    const onChange = vi.fn();
    const store = new DocumentLocksStore('p1', onChange);
    store.dispose();
    deferred.resolve([{ documentId: 'd1', expiresAt: 'T' }]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.isLocked('d1')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(getDocumentLocks).toHaveBeenCalledTimes(1);
  });
});
