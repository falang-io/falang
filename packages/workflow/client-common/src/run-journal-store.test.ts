import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IApiRunJournalEntry } from './api-types.js';

const { getRunJournal, getWorkflowJournal } = vi.hoisted(() => ({
  getRunJournal: vi.fn(),
  getWorkflowJournal: vi.fn(),
}));
vi.mock('./api-client.js', () => ({
  workflowApi: {
    getRunJournal: (...args: unknown[]) => getRunJournal(...args),
    getWorkflowJournal: (...args: unknown[]) => getWorkflowJournal(...args),
  },
}));

const { RunJournalStore } = await import('./run-journal-store.js');
const { filterJournalEntries, lastJournalEntryId, mergeJournalEntries, splitJournalData, NO_JOURNAL_FILTERS } =
  await import('./run-journal-model.js');

const entry = (id: string, over: Partial<IApiRunJournalEntry> = {}): IApiRunJournalEntry => ({
  id,
  workflowId: 'w',
  runId: 'r',
  env: 'dev',
  kind: 'log',
  level: 'info',
  message: `m${id}`,
  data: null,
  documentId: null,
  nodeId: null,
  vendor: null,
  truncated: false,
  textsStripped: false,
  ts: '2026-10-06T10:00:00.000Z',
  ...over,
});

describe('run journal model', () => {
  it('merges without duplicates and keeps order', () => {
    const merged = mergeJournalEntries([entry('1'), entry('2')], [entry('2'), entry('3')]);
    expect(merged.map((e) => e.id)).toEqual(['1', '2', '3']);
  });

  it('sorts by (ts, id) and uses the greatest id as the cursor', () => {
    const merged = mergeJournalEntries(
      [entry('9', { ts: '2026-10-06T10:00:05.000Z' })],
      [entry('10', { ts: '2026-10-06T10:00:01.000Z' }), entry('2', { ts: '2026-10-06T10:00:05.000Z' })],
    );
    expect(merged.map((e) => e.id)).toEqual(['10', '2', '9']);
    expect(lastJournalEntryId(merged)).toBe('10');
    expect(lastJournalEntryId([])).toBeNull();
  });

  it('filters by kind, level and errors-only', () => {
    const all = [
      entry('1'),
      entry('2', { kind: 'ai' }),
      entry('3', { level: 'warn' }),
      entry('4', { level: 'error', kind: 'error' }),
    ];
    expect(filterJournalEntries(all, { ...NO_JOURNAL_FILTERS, kinds: ['ai'] }).map((e) => e.id)).toEqual(['2']);
    expect(filterJournalEntries(all, { ...NO_JOURNAL_FILTERS, level: 'warn' }).map((e) => e.id)).toEqual(['3']);
    expect(filterJournalEntries(all, { ...NO_JOURNAL_FILTERS, errorsOnly: true }).map((e) => e.id)).toEqual(['3', '4']);
  });

  it('splits readable text fields from the rest of data', () => {
    expect(splitJournalData({ prompt: 'hi', model: 'x', usage: { a: 1 } })).toEqual({
      texts: [{ key: 'prompt', value: 'hi' }],
      rest: { model: 'x', usage: { a: 1 } },
    });
    expect(splitJournalData(null)).toEqual({ texts: [], rest: null });
  });
});

describe('RunJournalStore', () => {
  beforeEach(() => {
    getRunJournal.mockReset();
    getWorkflowJournal.mockReset();
  });

  it('pages incrementally with the after cursor and dedupes', async () => {
    getRunJournal
      .mockResolvedValueOnce({ entries: [entry('1'), entry('2')], hasMore: true })
      .mockResolvedValueOnce({ entries: [entry('2'), entry('3')], hasMore: false });
    const store = new RunJournalStore({ kind: 'run', projectId: 'p', workflowId: 'w', runId: 'r' });
    const added = await store.fetchNew();
    expect(added).toBe(3);
    expect(store.entries.map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(getRunJournal).toHaveBeenNthCalledWith(1, 'p', 'w', 'r', { limit: 200 });
    expect(getRunJournal).toHaveBeenNthCalledWith(2, 'p', 'w', 'r', { after: '2', limit: 200 });
    expect(store.hasMore).toBe(false);
  });

  it('does not skip entries when ts order differs from id order across pages', async () => {
    getRunJournal
      .mockResolvedValueOnce({
        entries: [entry('1', { ts: '2026-10-06T10:00:09.000Z' }), entry('2', { ts: '2026-10-06T10:00:08.000Z' })],
        hasMore: true,
      })
      .mockResolvedValueOnce({ entries: [entry('3', { ts: '2026-10-06T10:00:01.000Z' })], hasMore: false });
    const store = new RunJournalStore({ kind: 'run', projectId: 'p', workflowId: 'w', runId: 'r' });
    await store.fetchNew();
    expect(getRunJournal).toHaveBeenNthCalledWith(2, 'p', 'w', 'r', { after: '2', limit: 200 });
    expect(store.entries.map((e) => e.id)).toEqual(['3', '2', '1']);
  });

  it('a later poll only asks for entries after the last id', async () => {
    getRunJournal.mockResolvedValueOnce({ entries: [entry('1')], hasMore: false });
    const store = new RunJournalStore({ kind: 'run', projectId: 'p', workflowId: 'w', runId: 'r' });
    await store.fetchNew();
    getRunJournal.mockResolvedValueOnce({ entries: [entry('5')], hasMore: false });
    expect(await store.fetchNew()).toBe(1);
    expect(getRunJournal).toHaveBeenLastCalledWith('p', 'w', 'r', { after: '1', limit: 200 });
  });

  it('uses the workflow endpoint for the whole conversation', async () => {
    getWorkflowJournal.mockResolvedValueOnce({ entries: [entry('1', { runId: null })], hasMore: false });
    const store = new RunJournalStore({ kind: 'workflow', projectId: 'p', workflowId: 'tg-1' });
    await store.loadMore();
    expect(getWorkflowJournal).toHaveBeenCalledWith('p', 'tg-1', { limit: 200 });
    expect(store.entries).toHaveLength(1);
  });

  it('keeps entries and reports an error when a fetch fails', async () => {
    getRunJournal.mockResolvedValueOnce({ entries: [entry('1')], hasMore: false });
    const store = new RunJournalStore({ kind: 'run', projectId: 'p', workflowId: 'w', runId: 'r' });
    await store.fetchNew();
    getRunJournal.mockRejectedValueOnce(new Error('boom'));
    await store.fetchNew();
    expect(store.error).toBe('boom');
    expect(store.entries).toHaveLength(1);
  });

  it('ignores answers after dispose', async () => {
    getRunJournal.mockResolvedValueOnce({ entries: [entry('1')], hasMore: false });
    const store = new RunJournalStore({ kind: 'run', projectId: 'p', workflowId: 'w', runId: 'r' });
    store.dispose();
    await store.fetchNew();
    expect(store.entries).toHaveLength(0);
  });
});
