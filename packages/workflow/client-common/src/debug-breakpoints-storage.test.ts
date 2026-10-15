import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPersistedBreakpoints, persistBreakpoints } from './debug-breakpoints-storage.js';

describe('debug breakpoints storage', () => {
  let store = new Map<string, string>();
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips breakpoints per project', () => {
    persistBreakpoints('p1', [{ documentId: 'd', nodeId: 'n' }]);
    persistBreakpoints('p2', [{ documentId: 'd2', nodeId: 'n2' }]);
    expect(loadPersistedBreakpoints('p1')).toEqual([{ documentId: 'd', nodeId: 'n' }]);
    expect(loadPersistedBreakpoints('p2')).toEqual([{ documentId: 'd2', nodeId: 'n2' }]);
  });

  it('returns [] when nothing is stored', () => {
    expect(loadPersistedBreakpoints('p1')).toEqual([]);
  });

  it('drops malformed entries and non-array payloads', () => {
    store.set(
      'falang-workflow-debug-breakpoints:p1',
      JSON.stringify([
        { documentId: 'd', nodeId: 'n' },
        { documentId: 1, nodeId: 'n' },
        { documentId: 'd', nodeId: 2 },
        null,
        'x',
      ]),
    );
    expect(loadPersistedBreakpoints('p1')).toEqual([{ documentId: 'd', nodeId: 'n' }]);
    store.set('falang-workflow-debug-breakpoints:p1', '{"a":1}');
    expect(loadPersistedBreakpoints('p1')).toEqual([]);
  });

  it('returns [] on invalid JSON', () => {
    store.set('falang-workflow-debug-breakpoints:p1', '{oops');
    expect(loadPersistedBreakpoints('p1')).toEqual([]);
  });

  it('swallows storage failures', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => persistBreakpoints('p1', [])).not.toThrow();
    expect(loadPersistedBreakpoints('p1')).toEqual([]);
  });
});
