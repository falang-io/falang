/* oxlint-disable no-plusplus, no-undefined, no-void, no-await-in-loop, init-declarations, no-nested-ternary, unicorn/no-nested-ternary, parameter-properties, consistent-existence-index-check */
import { defaultPayloadConverter, type ActivityInterceptorsFactory, type WorkerOptions } from '@temporalio/worker';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  buildWorkflowSourceKey,
  RUN_JOURNAL_NODE_HEADER,
  RUN_JOURNAL_SINK_METHOD,
  RUN_JOURNAL_SINK_NAME,
  type IRunJournalNodeHeader,
} from '@falang/workflow-dto';
import { JOURNAL_KINDS, JOURNAL_LEVELS, type IJournalSink, type IJournalWireEntry } from './journal-types.js';

export const JOURNAL_SINK_NAME = RUN_JOURNAL_SINK_NAME;
export const JOURNAL_NODE_HEADER = RUN_JOURNAL_NODE_HEADER;

export type IJournalNode = IRunJournalNodeHeader;

/** Filled by the activity inbound interceptor from the workflow's `falang-node` header; read by the activity wrapper. */
export const journalNodeStorage = new AsyncLocalStorage<IJournalNode>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Validates what a compiled workflow passed to `falangJournal.append`; `null` for anything malformed. */
export const sinkEntryToWire = (
  info: { workflowId: string; runId: string },
  raw: unknown,
  now: () => number = Date.now,
): IJournalWireEntry | null => {
  if (!isRecord(raw)) return null;
  const { seq, ts, kind, level, message, data } = raw;
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return null;
  if (!JOURNAL_KINDS.includes(kind as never) || !JOURNAL_LEVELS.includes(level as never)) return null;
  if (typeof message !== 'string') return null;
  return {
    workflowId: info.workflowId,
    runId: info.runId,
    sourceKey: buildWorkflowSourceKey(info.runId, seq),
    kind: kind as IJournalWireEntry['kind'],
    level: level as IJournalWireEntry['level'],
    message,
    data: isRecord(data) ? data : null,
    documentId: optionalString(raw.documentId),
    nodeId: optionalString(raw.nodeId),
    vendor: optionalString(raw.vendor),
    ts: typeof ts === 'number' && Number.isFinite(ts) ? ts : now(),
  };
};

/** The activity inbound interceptor: decodes the `falang-node` header into `journalNodeStorage` for the call. */
export const createJournalActivityInterceptor: ActivityInterceptorsFactory = () => ({
  inbound: {
    execute: (input, next) => {
      let node: IJournalNode | undefined;
      try {
        const payload = input.headers?.[JOURNAL_NODE_HEADER];
        const decoded = payload ? defaultPayloadConverter.fromPayload<unknown>(payload) : undefined;
        if (isRecord(decoded) && typeof decoded.documentId === 'string') {
          node = { documentId: decoded.documentId, nodeId: typeof decoded.nodeId === 'string' ? decoded.nodeId : null };
        }
      } catch {
        // A malformed header just means no node id.
      }
      return node ? journalNodeStorage.run(node, () => next(input)) : next(input);
    },
  },
});

/**
 * The journal's `WorkerOptions` slice: the `falangJournal` sink (never called during replay) and the activity
 * interceptor. A pure function so the options are testable without a Worker.
 */
export const buildJournalWorkerOptions = (
  buffer: IJournalSink,
  now: () => number = Date.now,
): Pick<WorkerOptions, 'sinks' | 'interceptors'> => ({
  sinks: {
    [JOURNAL_SINK_NAME]: {
      [RUN_JOURNAL_SINK_METHOD]: {
        fn: (info: { workflowId: string; runId: string }, entry: unknown) => {
          try {
            const wire = sinkEntryToWire(info, entry, now);
            if (wire) buffer.push(wire);
          } catch {
            // never fails the workflow task
          }
        },
        callDuringReplay: false,
      },
    },
  } as unknown as WorkerOptions['sinks'],
  interceptors: { activity: [createJournalActivityInterceptor] },
});
