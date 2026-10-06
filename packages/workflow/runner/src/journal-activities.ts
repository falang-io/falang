/* oxlint-disable no-plusplus, no-undefined, no-void, no-await-in-loop, init-declarations, no-nested-ternary, unicorn/no-nested-ternary, parameter-properties, consistent-existence-index-check */
import { ApplicationFailure, CancelledFailure, Context } from '@temporalio/activity';
import {
  buildActivityErrorSourceKey,
  buildActivitySourceKey,
  type IRunJournalActivitySpec,
} from '@falang/workflow-dto';
import { journalNodeStorage } from './journal-sink.js';
import type { IJournalSink, IJournalWireEntry } from './journal-types.js';

type TActivityFn = (...args: unknown[]) => unknown;

export type IActivityJournalSpec = IRunJournalActivitySpec;

export interface IActivityRunInfo {
  readonly activityId: string;
  readonly attempt: number;
  readonly workflowId: string;
  readonly runId: string;
}

export interface IJournalActivitiesOptions {
  readonly buffer: IJournalSink;
  readonly specs: Record<string, IActivityJournalSpec>;
  readonly params: Record<string, string[]>;
  readonly vendors: Record<string, string>;
  readonly now?: () => number;
  readonly getInfo?: () => IActivityRunInfo | null;
}

const MESSAGE_MAX = 200;
const ERROR_MESSAGE_MAX = 1024;
const TEXT_ARG_NAMES = ['text', 'caption', 'question', 'message', 'prompt'];
const LEGACY_LOG_ACTIVITY = 'logActivity';

const defaultGetInfo = (): IActivityRunInfo | null => {
  try {
    const info = Context.current().info;
    const execution = info.workflowExecution;
    if (!execution?.workflowId || !execution.runId) return null;
    return {
      activityId: info.activityId,
      attempt: info.attempt,
      workflowId: execution.workflowId,
      runId: execution.runId,
    };
  } catch {
    return null;
  }
};

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pickArgs = (
  spec: IActivityJournalSpec,
  paramNames: readonly string[] | undefined,
  args: readonly unknown[],
): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  if (!paramNames) return picked;
  for (const name of spec.args) {
    const index = paramNames.indexOf(name);
    if (index >= 0 && index < args.length && args[index] !== undefined) picked[name] = args[index];
  }
  return picked;
};

/** The error's own message/type only — never arguments. */
const describeError = (error: unknown): { message: string; errorType: string; retryable: boolean } => {
  const message = error instanceof Error ? error.message : String(error);
  const errorType =
    error instanceof ApplicationFailure && error.type ? error.type : error instanceof Error ? error.name : 'Error';
  const retryable = !(error instanceof ApplicationFailure && error.nonRetryable);
  return { message: truncate(message, ERROR_MESSAGE_MAX), errorType, retryable };
};

const buildSuccessEntry = (
  name: string,
  spec: IActivityJournalSpec,
  paramNames: readonly string[] | undefined,
  args: readonly unknown[],
  output: unknown,
  base: { documentId: string | null; nodeId: string | null; vendor: string | null },
  durationMs: number,
  info: IActivityRunInfo,
): Omit<IJournalWireEntry, 'workflowId' | 'runId' | 'ts'> => {
  const picked = pickArgs(spec, paramNames, args);
  const data: Record<string, unknown> = { args: picked, durationMs, attempt: info.attempt, activity: name };
  let message: string;
  let resultValue = output;
  let model: string | undefined;

  if (spec.kind === 'ai') {
    if (isRecord(output) && (output.usage !== undefined || typeof output.model === 'string')) {
      // Text activities return `{ text, usage, model }`; call-ai-choice returns `{ action, data, usage, model }`.
      if (typeof output.model === 'string') model = output.model;
      if (output.usage !== undefined) data.usage = output.usage;
      if (model) data.model = model;
      resultValue =
        'text' in output
          ? output.text
          : Object.fromEntries(Object.entries(output).filter(([key]) => key !== 'usage' && key !== 'model'));
    } else if (typeof picked.model === 'string') {
      model = picked.model;
    }
    message = `${base.vendor ?? 'ai'}: ${name}${model ? ` (${model})` : ''}`;
  } else {
    const text = TEXT_ARG_NAMES.map((n) => picked[n]).find((v): v is string => typeof v === 'string' && v !== '');
    message = text ? truncate(text, MESSAGE_MAX) : `${base.vendor ?? 'message'}: ${name}`;
  }
  if (spec.result !== false && resultValue !== undefined) data.result = resultValue;

  return {
    sourceKey: buildActivitySourceKey(info.runId, info.activityId, info.attempt),
    kind: spec.kind,
    level: 'info',
    message,
    data,
    ...base,
  };
};

/**
 * Wraps already-egress-wrapped activities so each completion/failure is enqueued into the journal (ADR 0059 §2b).
 * The journal is never awaited and never throws into the activity; results and errors pass through unchanged.
 */
export const wrapActivitiesWithJournal = (
  activities: Record<string, unknown>,
  options: IJournalActivitiesOptions,
): Record<string, unknown> => {
  const now = options.now ?? Date.now;
  const getInfo = options.getInfo ?? defaultGetInfo;
  const result: Record<string, unknown> = {};

  const enqueue = (info: IActivityRunInfo, partial: Omit<IJournalWireEntry, 'workflowId' | 'runId' | 'ts'>): void => {
    try {
      options.buffer.push({ workflowId: info.workflowId, runId: info.runId, ts: now(), ...partial });
    } catch {
      // never affects the activity
    }
  };

  for (const [name, value] of Object.entries(activities)) {
    const vendor = options.vendors[name];
    const spec = options.specs[name];
    const isLegacyLog = name === LEGACY_LOG_ACTIVITY;
    if (typeof value !== 'function') {
      result[name] = value;
      continue;
    }
    const fn = value as TActivityFn;
    result[name] = async (...args: unknown[]) => {
      const startedAt = now();
      const node = journalNodeStorage.getStore();
      const base = {
        documentId: node?.documentId ?? null,
        nodeId: node?.nodeId ?? null,
        vendor: vendor ?? null,
      };
      try {
        const output = await fn(...args);
        try {
          const info = getInfo();
          if (info) {
            if (spec) {
              enqueue(
                info,
                buildSuccessEntry(name, spec, options.params[name], args, output, base, now() - startedAt, info),
              );
            } else if (isLegacyLog && typeof args[0] === 'string') {
              enqueue(info, {
                sourceKey: buildActivitySourceKey(info.runId, info.activityId, info.attempt),
                kind: 'log',
                level: 'info',
                message: args[0],
                data: null,
                documentId: null,
                nodeId: null,
                vendor: null,
              });
            }
          }
        } catch {
          // journal problems never fail an activity
        }
        return output;
      } catch (error) {
        try {
          const info = getInfo();
          if (info && !(error instanceof CancelledFailure)) {
            const { message, errorType, retryable } = describeError(error);
            enqueue(info, {
              sourceKey: buildActivityErrorSourceKey(info.runId, info.activityId, info.attempt),
              kind: 'error',
              level: retryable ? 'warn' : 'error',
              message,
              data: { errorType, attempt: info.attempt, durationMs: now() - startedAt, activity: name },
              ...base,
            });
          }
        } catch {
          // journal problems never mask the real error
        }
        throw error;
      }
    };
  }
  return result;
};
