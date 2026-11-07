import { describe, expect, it, vi } from 'vitest';
import type { ITableRecord } from '@falang/workflow-dto';
import { TableStore, type ITableApi } from './table-store.js';

const record = (id: string, version = 1): ITableRecord => ({
  id,
  version,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  data: { f1: id },
});

const makeApi = (overrides: Partial<ITableApi> = {}) => {
  const api = {
    listTableRecords: vi.fn().mockResolvedValue({ records: [record('a'), record('b')], total: 120 }),
    createTableRecord: vi.fn().mockResolvedValue(record('new')),
    patchTableRecord: vi.fn((_p: string, _t: string, id: string) => Promise.resolve(record(id, 2))),
    deleteTableRecord: vi.fn().mockResolvedValue(null),
    clearTable: vi.fn().mockResolvedValue({ deleted: 2 }),
    copyTableToProd: vi.fn().mockResolvedValue({ copied: 2 }),
    importTableCsv: vi.fn(),
    getTableRecordHistory: vi.fn().mockResolvedValue({ changes: [] }),
    restoreTableRecord: vi.fn().mockResolvedValue(record('a', 3)),
  };
  return Object.assign(api, overrides) as typeof api;
};

describe('TableStore', () => {
  it('loads the first page with env, limit and offset', async () => {
    const api = makeApi();
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    await store.load();
    expect(api.listTableRecords).toHaveBeenCalledWith('p', 't', { env: 'dev', limit: 50, offset: 0 });
    expect(store.records).toHaveLength(2);
    expect(store.total).toBe(120);
  });

  it('pages, searches (reset to page 1) and sorts', async () => {
    const api = makeApi();
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    await store.setPage(3);
    expect(api.listTableRecords).toHaveBeenLastCalledWith('p', 't', { env: 'dev', limit: 50, offset: 100 });
    await store.setSearch(' bob ');
    expect(api.listTableRecords).toHaveBeenLastCalledWith('p', 't', {
      env: 'dev',
      limit: 50,
      offset: 0,
      search: 'bob',
    });
    await store.toggleSort('f1');
    expect(api.listTableRecords).toHaveBeenLastCalledWith('p', 't', {
      env: 'dev',
      limit: 50,
      offset: 0,
      search: 'bob',
      sortField: 'f1',
      sortDir: 'asc',
    });
    await store.toggleSort('f1');
    expect(store.sortDir).toBe('desc');
    await store.toggleSort('f1');
    expect(store.sortField).toBeNull();
    await store.setSort('f2', 'desc');
    expect(store.sortField).toBe('f2');
    expect(store.sortDir).toBe('desc');
  });

  it('switches env and resets the page', async () => {
    const api = makeApi();
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    await store.setPage(2);
    await store.setEnv('prod');
    expect(api.listTableRecords).toHaveBeenLastCalledWith('p', 't', { env: 'prod', limit: 50, offset: 0 });
    expect(store.page).toBe(1);
  });

  it('drops a stale load answer', async () => {
    const api = makeApi();
    const resolvers: ((value: { records: ITableRecord[]; total: number }) => void)[] = [];
    api.listTableRecords
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          }),
      )
      .mockResolvedValueOnce({ records: [record('fresh')], total: 1 });
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    const first = store.load();
    await store.load();
    resolvers[0]?.({ records: [record('stale')], total: 9 });
    await first;
    expect(store.records.map((r) => r.id)).toEqual(['fresh']);
  });

  it('saves a cell with expectedVersion and swaps in the saved record', async () => {
    const api = makeApi();
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    await store.load();
    const saved = await store.patchRecord(record('a', 1), { f1: 'x' });
    expect(saved).toBe(true);
    expect(api.patchTableRecord).toHaveBeenCalledWith('p', 't', 'a', 'dev', { f1: 'x' }, 1);
    expect(store.records.find((r) => r.id === 'a')?.version).toBe(2);
  });

  it('flags a version conflict and reloads instead of throwing', async () => {
    const conflict = Object.assign(new Error('conflict'), { code: 'version_conflict' });
    const api = makeApi({ patchTableRecord: vi.fn().mockRejectedValue(conflict) });
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    await store.load();
    const loads = api.listTableRecords.mock.calls.length;
    expect(await store.patchRecord(record('a', 1), { f1: 'x' })).toBe(false);
    expect(store.conflict).toBe(true);
    expect(api.listTableRecords.mock.calls.length).toBe(loads + 1);
    store.clearConflict();
    expect(store.conflict).toBe(false);
  });

  it('rethrows other save errors', async () => {
    const api = makeApi({ patchTableRecord: vi.fn().mockRejectedValue(new Error('boom')) });
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    await expect(store.patchRecord(record('a'), { f1: 'x' })).rejects.toThrow('boom');
    expect(store.conflict).toBe(false);
  });

  it('steps back a page when its last row is deleted', async () => {
    const api = makeApi();
    api.listTableRecords.mockResolvedValue({ records: [record('only')], total: 51 });
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    await store.setPage(2);
    await store.deleteRecord('only');
    expect(store.page).toBe(1);
  });

  it('copy to prod reloads only while viewing prod', async () => {
    const api = makeApi();
    const store = new TableStore('p', 't', api as unknown as ITableApi);
    expect(await store.copyToProd()).toBe(2);
    expect(api.listTableRecords).not.toHaveBeenCalled();
    await store.setEnv('prod');
    api.listTableRecords.mockClear();
    await store.copyToProd();
    expect(api.listTableRecords).toHaveBeenCalledTimes(1);
  });
});
