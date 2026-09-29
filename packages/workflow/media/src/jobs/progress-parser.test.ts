import { describe, expect, it } from 'vitest';
import type { IProgressUpdate } from './progress-parser.js';
import { ProgressStreamParser } from './progress-parser.js';

describe('ProgressStreamParser', () => {
  it('parses a full block delivered in one chunk', () => {
    const parser = new ProgressStreamParser();
    const updates: IProgressUpdate[] = [];
    parser.feed('frame=10\nout_time_ms=2500000\nprogress=continue\n', (update) => updates.push(update));
    expect(updates).toEqual([{ outTimeMs: 2_500_000, done: false }]);
  });

  it('handles a block split across two chunks, mid-line', () => {
    const parser = new ProgressStreamParser();
    const updates: IProgressUpdate[] = [];
    parser.feed('out_time_ms=100', (update) => updates.push(update));
    parser.feed('0000\nprogress=continue\n', (update) => updates.push(update));
    expect(updates).toEqual([{ outTimeMs: 1_000_000, done: false }]);
  });

  it('reports done on progress=end and keeps the last known out_time_ms', () => {
    const parser = new ProgressStreamParser();
    const updates: IProgressUpdate[] = [];
    parser.feed('out_time_ms=5000000\nprogress=end\n', (update) => updates.push(update));
    expect(updates).toEqual([{ outTimeMs: 5_000_000, done: true }]);
  });

  it('ignores a non-numeric out_time_ms rather than throwing, keeping the last known value (0)', () => {
    const parser = new ProgressStreamParser();
    const updates: IProgressUpdate[] = [];
    parser.feed('out_time_ms=N/A\nprogress=continue\n', (update) => updates.push(update));
    expect(updates).toEqual([{ outTimeMs: 0, done: false }]);
  });
});
