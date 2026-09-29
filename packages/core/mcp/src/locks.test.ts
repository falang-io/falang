import { describe, expect, it } from 'vitest';
import {
  acquireLock,
  DEFAULT_LOCK_TTL_MS,
  findActiveLock,
  isLockActive,
  pruneExpired,
  releaseLock,
  renewLock,
  type IDocumentLock,
} from './locks.js';

const NOW = 1_700_000_000_000;

describe('locks', () => {
  describe('isLockActive / findActiveLock', () => {
    it('a lock is active before its expiresAt and inactive after', () => {
      const lock: IDocumentLock = {
        acquiredAt: new Date(NOW).toISOString(),
        documentId: 'doc-1',
        expiresAt: new Date(NOW + 1000).toISOString(),
        owner: 'agent-1',
      };
      expect(isLockActive(lock, NOW)).toBe(true);
      expect(isLockActive(lock, NOW + 999)).toBe(true);
      expect(isLockActive(lock, NOW + 1000)).toBe(false);
      expect(isLockActive(lock, NOW + 5000)).toBe(false);
    });

    it('findActiveLock ignores an expired lock for the same document', () => {
      const lock: IDocumentLock = {
        acquiredAt: new Date(NOW).toISOString(),
        documentId: 'doc-1',
        expiresAt: new Date(NOW + 1000).toISOString(),
        owner: 'agent-1',
      };
      expect(findActiveLock([lock], 'doc-1', NOW)).toEqual(lock);
      expect(findActiveLock([lock], 'doc-1', NOW + 2000)).toBeNull();
      expect(findActiveLock([lock], 'doc-2', NOW)).toBeNull();
    });
  });

  describe('acquireLock', () => {
    it('creates a fresh lock on an unlocked document', () => {
      const result = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.locks).toEqual([
        {
          acquiredAt: new Date(NOW).toISOString(),
          documentId: 'doc-1',
          expiresAt: new Date(NOW + DEFAULT_LOCK_TTL_MS).toISOString(),
          owner: 'agent-1',
        },
      ]);
    });

    it('the same owner re-acquiring renews the lock in place', () => {
      const first = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      if (!first.ok) throw new Error('expected ok');
      const second = acquireLock(first.locks, { documentId: 'doc-1', now: NOW + 1000, owner: 'agent-1' });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.locks).toHaveLength(1);
      expect(second.locks[0].expiresAt).toBe(new Date(NOW + 1000 + DEFAULT_LOCK_TTL_MS).toISOString());
    });

    it('a different owner cannot acquire an active lock', () => {
      const first = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      if (!first.ok) throw new Error('expected ok');
      const second = acquireLock(first.locks, { documentId: 'doc-1', now: NOW + 1000, owner: 'agent-2' });
      expect(second).toEqual({ error: expect.stringContaining('locked by another session'), ok: false });
    });

    it('a different owner can acquire once the lock has expired', () => {
      const first = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      if (!first.ok) throw new Error('expected ok');
      const later = NOW + DEFAULT_LOCK_TTL_MS + 1;
      const second = acquireLock(first.locks, { documentId: 'doc-1', now: later, owner: 'agent-2' });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.locks).toEqual([
        {
          acquiredAt: new Date(later).toISOString(),
          documentId: 'doc-1',
          expiresAt: new Date(later + DEFAULT_LOCK_TTL_MS).toISOString(),
          owner: 'agent-2',
        },
      ]);
    });

    it('respects a custom ttlMs', () => {
      const result = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1', ttlMs: 1000 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.locks[0].expiresAt).toBe(new Date(NOW + 1000).toISOString());
    });
  });

  describe('renewLock', () => {
    it('fails when there is no active lock at all', () => {
      const result = renewLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      expect(result).toEqual({ error: expect.stringContaining('no active lock'), ok: false });
    });

    it('fails when the active lock is held by a different owner', () => {
      const first = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      if (!first.ok) throw new Error('expected ok');
      const result = renewLock(first.locks, { documentId: 'doc-1', now: NOW + 10, owner: 'agent-2' });
      expect(result).toEqual({ error: expect.stringContaining('locked by another session'), ok: false });
    });

    it('extends the expiry, keeping the original acquiredAt, for the owning session', () => {
      const first = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      if (!first.ok) throw new Error('expected ok');
      const result = renewLock(first.locks, { documentId: 'doc-1', now: NOW + 10, owner: 'agent-1' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.locks).toEqual([
        {
          acquiredAt: new Date(NOW).toISOString(),
          documentId: 'doc-1',
          expiresAt: new Date(NOW + 10 + DEFAULT_LOCK_TTL_MS).toISOString(),
          owner: 'agent-1',
        },
      ]);
    });
  });

  describe('releaseLock', () => {
    it('releasing a document with no lock is a no-op success', () => {
      const result = releaseLock([], 'doc-1', 'agent-1');
      expect(result).toEqual({ locks: [], ok: true });
    });

    it('the owner can release their own lock', () => {
      const first = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      if (!first.ok) throw new Error('expected ok');
      const result = releaseLock(first.locks, 'doc-1', 'agent-1');
      expect(result).toEqual({ locks: [], ok: true });
    });

    it('a different owner cannot release the lock', () => {
      const first = acquireLock([], { documentId: 'doc-1', now: NOW, owner: 'agent-1' });
      if (!first.ok) throw new Error('expected ok');
      const result = releaseLock(first.locks, 'doc-1', 'agent-2');
      expect(result).toEqual({ error: expect.stringContaining('locked by another session'), ok: false });
      expect(result.ok).toBe(false);
    });
  });

  describe('pruneExpired', () => {
    it('drops expired locks and keeps active ones', () => {
      const active: IDocumentLock = {
        acquiredAt: new Date(NOW).toISOString(),
        documentId: 'doc-active',
        expiresAt: new Date(NOW + 10_000).toISOString(),
        owner: 'agent-1',
      };
      const expired: IDocumentLock = {
        acquiredAt: new Date(NOW - 10_000).toISOString(),
        documentId: 'doc-expired',
        expiresAt: new Date(NOW - 1).toISOString(),
        owner: 'agent-1',
      };
      expect(pruneExpired([active, expired], NOW)).toEqual([active]);
    });
  });
});
