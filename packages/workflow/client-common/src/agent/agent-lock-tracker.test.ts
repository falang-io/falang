import { describe, expect, it, vi } from 'vitest';
import { DocumentLockedError } from '../api-document-lock-error.js';
import { AgentLockTracker } from './agent-lock-tracker.js';

describe('AgentLockTracker', () => {
  it('acquire sends one lock request per document, ownerFor reflects it once the promise resolves', async () => {
    const lock = vi.fn().mockResolvedValue(null);
    const unlock = vi.fn().mockResolvedValue(null);
    const onConflict = vi.fn();
    const tracker = new AgentLockTracker({ lock, onConflict, owner: 'agent:1', unlock });

    tracker.acquire('doc-a');
    tracker.acquire('doc-a');
    tracker.acquire('doc-b');
    await Promise.resolve();

    expect(lock).toHaveBeenCalledTimes(2);
    expect(lock).toHaveBeenCalledWith('doc-a', 'agent:1');
    expect(lock).toHaveBeenCalledWith('doc-b', 'agent:1');
    expect(tracker.ownerFor('doc-a')).toBe('agent:1');
    expect(tracker.ownerFor('doc-b')).toBe('agent:1');
    expect(tracker.ownerFor('doc-c')).toBeNull();
  });

  it('a 409 from a different owner is routed to onConflict, not swallowed', async () => {
    const lock = vi.fn().mockRejectedValue(new DocumentLockedError('doc-a', '2099-01-01T00:00:00.000Z'));
    const unlock = vi.fn().mockResolvedValue(null);
    const onConflict = vi.fn();
    const tracker = new AgentLockTracker({ lock, onConflict, owner: 'agent:1', unlock });

    tracker.acquire('doc-a');
    await Promise.resolve();
    await Promise.resolve();

    expect(onConflict).toHaveBeenCalledWith('doc-a', '2099-01-01T00:00:00.000Z');
  });

  it('a non-lock error is swallowed (fire-and-forget)', async () => {
    const lock = vi.fn().mockRejectedValue(new Error('network down'));
    const unlock = vi.fn().mockResolvedValue(null);
    const onConflict = vi.fn();
    const tracker = new AgentLockTracker({ lock, onConflict, owner: 'agent:1', unlock });

    tracker.acquire('doc-a');
    await Promise.resolve();
    await Promise.resolve();

    expect(onConflict).not.toHaveBeenCalled();
    expect(tracker.ownerFor('doc-a')).toBe('agent:1');
  });

  it('releaseAll unlocks every tracked document and clears the set', () => {
    const lock = vi.fn().mockResolvedValue(null);
    const unlock = vi.fn().mockResolvedValue(null);
    const tracker = new AgentLockTracker({ lock, onConflict: vi.fn(), owner: 'agent:1', unlock });

    tracker.acquire('doc-a');
    tracker.acquire('doc-b');
    tracker.releaseAll();

    expect(unlock).toHaveBeenCalledTimes(2);
    expect(unlock).toHaveBeenCalledWith('doc-a', 'agent:1');
    expect(unlock).toHaveBeenCalledWith('doc-b', 'agent:1');
    expect(tracker.ownerFor('doc-a')).toBeNull();
    expect(tracker.ownerFor('doc-b')).toBeNull();
  });

  it('acquire after releaseAll sends a fresh lock request for the same document', () => {
    const lock = vi.fn().mockResolvedValue(null);
    const unlock = vi.fn().mockResolvedValue(null);
    const tracker = new AgentLockTracker({ lock, onConflict: vi.fn(), owner: 'agent:1', unlock });

    tracker.acquire('doc-a');
    tracker.releaseAll();
    tracker.acquire('doc-a');

    expect(lock).toHaveBeenCalledTimes(2);
  });
});
