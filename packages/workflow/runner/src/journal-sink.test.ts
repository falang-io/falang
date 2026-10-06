/* oxlint-disable no-plusplus, no-undefined, no-void, no-empty-function, require-await, no-inline-comments, no-non-null-assertion, no-explicit-any */
import { defaultPayloadConverter } from '@temporalio/worker';
import { describe, expect, it, vi } from 'vitest';
import {
  buildJournalWorkerOptions,
  createJournalActivityInterceptor,
  journalNodeStorage,
  sinkEntryToWire,
} from './journal-sink.js';
import type { IJournalWireEntry } from './journal-types.js';

const info = { workflowId: 'wf', runId: 'run1' };

describe('sinkEntryToWire', () => {
  it('maps a contract entry', () => {
    expect(
      sinkEntryToWire(info, {
        seq: 3,
        ts: 99,
        kind: 'log',
        level: 'info',
        message: 'hi',
        data: { a: 1 },
        documentId: 'd',
        nodeId: 'n',
        vendor: 'v',
      }),
    ).toEqual({
      workflowId: 'wf',
      runId: 'run1',
      sourceKey: 'run1:w:3',
      kind: 'log',
      level: 'info',
      message: 'hi',
      data: { a: 1 },
      documentId: 'd',
      nodeId: 'n',
      vendor: 'v',
      ts: 99,
    });
  });

  it('maps a sink entry whose frame had no node (documentId only) to nodeId null', () => {
    expect(
      sinkEntryToWire(info, { seq: 0, ts: 1, kind: 'error', level: 'error', message: 'm', documentId: 'd' }),
    ).toMatchObject({ documentId: 'd', nodeId: null, sourceKey: 'run1:w:0' });
  });

  it('ignores malformed entries and defaults ts / optionals', () => {
    expect(sinkEntryToWire(info, null)).toBeNull();
    expect(sinkEntryToWire(info, { seq: 'x', kind: 'log', level: 'info', message: 'm' })).toBeNull();
    expect(sinkEntryToWire(info, { seq: 1, kind: 'nope', level: 'info', message: 'm' })).toBeNull();
    expect(sinkEntryToWire(info, { seq: 1, kind: 'log', level: 'info', message: 5 })).toBeNull();
    expect(sinkEntryToWire(info, { seq: 1, kind: 'log', level: 'info', message: 'm' }, () => 7)).toMatchObject({
      ts: 7,
      data: null,
      documentId: null,
      nodeId: null,
      vendor: null,
    });
  });
});

describe('buildJournalWorkerOptions', () => {
  it('registers falangJournal.append with callDuringReplay: false that pushes into the buffer', () => {
    const push = vi.fn();
    const options = buildJournalWorkerOptions({ push });
    const append = (options.sinks as any).falangJournal.append;
    expect(append.callDuringReplay).toBe(false);
    append.fn(info, { seq: 1, ts: 1, kind: 'trigger', level: 'info', message: 't' });
    append.fn(info, 'garbage');
    expect(push).toHaveBeenCalledTimes(1);
    expect((push.mock.calls[0][0] as IJournalWireEntry).sourceKey).toBe('run1:w:1');
    expect(options.interceptors?.activity).toHaveLength(1);
  });
});

describe('activity interceptor', () => {
  const run = async (headers: Record<string, unknown>) => {
    const interceptor = createJournalActivityInterceptor({} as never).inbound!;
    return interceptor.execute!({ headers, args: [] } as never, (async () => journalNodeStorage.getStore()) as never);
  };

  it('exposes the node from the falang-node header', async () => {
    const payload = defaultPayloadConverter.toPayload({ documentId: 'd1', nodeId: 'n1' });
    expect(await run({ 'falang-node': payload })).toEqual({ documentId: 'd1', nodeId: 'n1' });
  });

  it('keeps the document when the frame has no node yet (nodeId null)', async () => {
    const payload = defaultPayloadConverter.toPayload({ documentId: 'd1', nodeId: null });
    expect(await run({ 'falang-node': payload })).toEqual({ documentId: 'd1', nodeId: null });
  });

  it('yields no node without or with a broken header', async () => {
    expect(await run({})).toBeUndefined();
    expect(await run({ 'falang-node': { data: new Uint8Array([1, 2]) } })).toBeUndefined();
  });
});
