// oxlint-disable no-await-in-loop -- sequential ticks are the point of the retry test.
import type { TTableDispatchStatus } from '@falang/workflow-dto';
import { describe, expect, it, vi } from 'vitest';
import { buildWirePayload, type IChangeOutboxStore, type IChangeRow } from './table-change-dispatch.js';
import type { ITableTriggerFinder } from './document-table-trigger-finder.js';
import {
  TableChangeDispatcherService,
  type IChangeDispatcherJournal,
  type ITableTriggerSignaller,
} from './table-change-dispatcher.service.js';

const NOW = new Date('2026-11-07T12:00:00.000Z');

const change = (overrides: Partial<IChangeRow> = {}): IChangeRow => ({
  id: 1,
  projectId: 'p1',
  tableId: 't1',
  env: 'dev',
  recordId: 'r1',
  op: 'created',
  before: null,
  after: { f1: 'Anna', version: 1 },
  changedFields: null,
  source: 'workflow',
  createdAt: new Date(NOW.getTime() - 1000),
  ...overrides,
});

interface IHarness {
  readonly service: TableChangeDispatcherService;
  readonly marked: Map<number, TTableDispatchStatus>;
  readonly signals: {
    projectId: string;
    env: string;
    signal: { workflowId: string; signalArgs: readonly unknown[] };
  }[];
  readonly journal: ReturnType<typeof vi.fn>;
  readonly find: ReturnType<typeof vi.fn>;
}

const harness = (
  rows: IChangeRow[],
  options: {
    targets?: { documentId: string; name: string }[];
    outcome?: 'delivered' | 'inactive' | Error;
    deliveredAlready?: number;
    maxPerMinute?: number;
  } = {},
): IHarness => {
  const marked = new Map<number, TTableDispatchStatus>();
  const signals: IHarness['signals'] = [];
  const claimed = new Set<number>();
  const store: IChangeOutboxStore = {
    claim: () => {
      const free = rows.filter((row) => !marked.has(row.id) && !claimed.has(row.id));
      for (const row of free) claimed.add(row.id);
      return Promise.resolve(free);
    },
    countDelivered: () => Promise.resolve(options.deliveredAlready ?? 0),
    recordCreatedAt: () => Promise.resolve(new Map<string, Date>()),
    mark: (id, status) => {
      marked.set(id, status);
      return Promise.resolve();
    },
    release: (id) => {
      claimed.delete(id);
      return Promise.resolve();
    },
  };
  const find = vi.fn().mockResolvedValue(options.targets ?? [{ documentId: 'd1', name: 'onClient' }]);
  const finder: ITableTriggerFinder = { find };
  const signaller: ITableTriggerSignaller = {
    signal: (projectId, env, signal) => {
      signals.push({ projectId, env, signal });
      const outcome = options.outcome ?? 'delivered';
      if (outcome instanceof Error) return Promise.reject(outcome);
      return Promise.resolve(outcome);
    },
  };
  const journal = vi.fn().mockResolvedValue(null);
  const journalPort: IChangeDispatcherJournal = { recordProblem: journal };
  const service = new TableChangeDispatcherService(store, finder, signaller, journalPort, {
    maxPerMinute: options.maxPerMinute ?? 600,
    maxAgeMs: 600_000,
  });
  return { service, marked, signals, journal, find };
};

describe('buildWirePayload', () => {
  it('maps created/updated/deleted changes to id-keyed records', () => {
    const created = buildWirePayload(change({ after: { f1: 'A', version: 1, createdAt: '2026-01-01T00:00:00.000Z' } }));
    expect(created).toEqual({
      table: 't1',
      record: {
        id: 'r1',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: new Date(NOW.getTime() - 1000).toISOString(),
        data: { f1: 'A' },
      },
      source: 'workflow',
    });

    const updated = buildWirePayload(
      change({ op: 'updated', before: { f1: 'A', version: 1 }, after: { f1: 'B', version: 2 }, changedFields: ['f1'] }),
      new Date('2026-01-02T00:00:00.000Z'),
    );
    expect(updated.record.version).toBe(2);
    expect(updated.record.createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(updated.previous?.data).toEqual({ f1: 'A' });
    expect(updated.changedFieldIds).toEqual(['f1']);

    const deleted = buildWirePayload(change({ op: 'deleted', before: { f1: 'A', version: 3 }, after: null }));
    expect(deleted.record.data).toEqual({ f1: 'A' });
    expect(deleted.previous).toBeUndefined();
  });
});

describe('TableChangeDispatcherService.tick', () => {
  it('delivers one workflow per change and trigger-function', async () => {
    const h = harness([change({ id: 7 })], {
      targets: [
        { documentId: 'd1', name: 'onA' },
        { documentId: 'd2', name: 'onB' },
      ],
    });
    await expect(h.service.tick(NOW)).resolves.toBe(1);
    expect(h.find).toHaveBeenCalledWith('p1', 't1', 'table-record-created');
    expect(h.signals.map((entry) => entry.signal.workflowId)).toEqual(['table-d1-7', 'table-d2-7']);
    expect(h.signals[0].signal.signalArgs[0]).toMatchObject({ table: 't1', source: 'workflow' });
    expect(h.marked.get(7)).toBe('delivered');
  });

  it('marks no_target when no trigger-function is bound', async () => {
    const h = harness([change()], { targets: [] });
    await h.service.tick(NOW);
    expect(h.marked.get(1)).toBe('no_target');
    expect(h.signals).toHaveLength(0);
  });

  it('leaves a change pending while the environment is inactive, then expires it', async () => {
    const fresh = harness([change()], { outcome: 'inactive' });
    await expect(fresh.service.tick(NOW)).resolves.toBe(0);
    expect(fresh.marked.size).toBe(0);

    const old = harness([change({ createdAt: new Date(NOW.getTime() - 601_000) })], { outcome: 'inactive' });
    await old.service.tick(NOW);
    expect(old.marked.get(1)).toBe('expired');
  });

  it('throttles above the per-minute cap and journals once a minute', async () => {
    const h = harness([change({ id: 1 }), change({ id: 2 })], { deliveredAlready: 600 });
    await h.service.tick(NOW);
    expect(h.marked.get(1)).toBe('throttled');
    expect(h.marked.get(2)).toBe('throttled');
    expect(h.journal).toHaveBeenCalledTimes(1);
    expect(h.journal.mock.calls[0][0]).toMatchObject({ projectId: 'p1', env: 'dev', vendor: 'tables' });
    expect(h.signals).toHaveLength(0);
  });

  it('counts the events delivered earlier in the same batch against the cap', async () => {
    const h = harness([change({ id: 1 }), change({ id: 2 }), change({ id: 3 })], { maxPerMinute: 2 });
    await h.service.tick(NOW);
    expect([1, 2, 3].map((id) => h.marked.get(id))).toEqual(['delivered', 'delivered', 'throttled']);
  });

  it('retries a failing delivery and gives up after 20 failures', async () => {
    const h = harness([change()], { outcome: new Error('temporal down') });
    for (let i = 0; i < 19; i += 1) await h.service.tick(NOW);
    expect(h.marked.size).toBe(0);
    await h.service.tick(NOW);
    expect(h.marked.get(1)).toBe('error');
  });

  it('does not overlap two ticks', async () => {
    const h = harness([change()]);
    const [a, b] = await Promise.all([h.service.tick(NOW), h.service.tick(NOW)]);
    expect(a + b).toBe(1);
  });
});
