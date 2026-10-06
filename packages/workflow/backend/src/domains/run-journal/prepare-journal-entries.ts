// oxlint-disable no-undefined, init-declarations -- `undefined` marks an absent optional; the policy branches assign message/data/truncated.
import {
  RUN_JOURNAL_DATA_MAX_LENGTH,
  RUN_JOURNAL_DATA_STRING_MAX_LENGTH,
  RUN_JOURNAL_MESSAGE_MAX_LENGTH,
  RUN_JOURNAL_METADATA_KEYS,
} from '@falang/workflow-dto';
import {
  JOURNAL_KINDS,
  JOURNAL_LEVELS,
  type IRunJournalEntryInput,
  type IRunJournalRow,
  type TJournalEnv,
  type TJournalKind,
  type TJournalLevel,
} from './run-journal.types.js';

export const MAX_MESSAGE_LENGTH = RUN_JOURNAL_MESSAGE_MAX_LENGTH;
export const MAX_DATA_STRING_LENGTH = RUN_JOURNAL_DATA_STRING_MAX_LENGTH;
export const MAX_DATA_LENGTH = RUN_JOURNAL_DATA_MAX_LENGTH;
const MAX_DEPTH = 24;
const OVERSIZE_PREVIEW_LENGTH = 16 * 1024;

export interface IPrepareJournalOptions {
  readonly projectId: string;
  readonly env: TJournalEnv;
  readonly buildId: string | null;
  /** `projects.journal_store_texts` — when `false`, content is stripped (ADR 0059 (private) §6). */
  readonly storeTexts: boolean;
}

const truncateText = (value: string, max: number): string => (value.length > max ? `${value.slice(0, max)}…` : value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Recursively caps every string; reports whether anything was cut. */
const limitStrings = (value: unknown, depth: number, state: { truncated: boolean }): unknown => {
  if (typeof value === 'string') {
    if (value.length <= MAX_DATA_STRING_LENGTH) return value;
    state.truncated = true;
    return `${value.slice(0, MAX_DATA_STRING_LENGTH)}…`;
  }
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= MAX_DEPTH) {
    state.truncated = true;
    return '[depth limit]';
  }
  if (Array.isArray(value)) return value.map((item) => limitStrings(item, depth + 1, state));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = limitStrings(item, depth + 1, state);
  return result;
};

/** Applies the per-string and whole-`data` limits. */
const limitData = (data: Record<string, unknown>): { data: Record<string, unknown>; truncated: boolean } => {
  const state = { truncated: false };
  const limited = limitStrings(data, 0, state) as Record<string, unknown>;
  const json = JSON.stringify(limited);
  if (json.length <= MAX_DATA_LENGTH) return { data: limited, truncated: state.truncated };
  return { data: { truncated: true, preview: json.slice(0, OVERSIZE_PREVIEW_LENGTH) }, truncated: true };
};

/** Top-level `data` keys that are metadata only (never user content) and survive the "don't store texts" policy. */
const SAFE_SCALAR_KEYS: ReadonlySet<string> = new Set(RUN_JOURNAL_METADATA_KEYS);

const isSafeScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 256);

const USAGE_KEYS = ['promptTokens', 'completionTokens', 'totalTokens'] as const;

const pickUsage = (value: unknown): Record<string, number> | null => {
  if (!isRecord(value)) return null;
  const usage: Record<string, number> = {};
  for (const key of USAGE_KEYS) {
    const item = value[key];
    if (typeof item === 'number' && Number.isFinite(item)) usage[key] = item;
  }
  return Object.keys(usage).length > 0 ? usage : null;
};

/** Keeps only `documentId`/`nodeId` of each frame of a position stack. */
const pickPosition = (value: unknown): Record<string, string>[] | null => {
  if (!Array.isArray(value)) return null;
  const frames: Record<string, string>[] = [];
  for (const frame of value.slice(0, 64)) {
    if (!isRecord(frame)) continue;
    const picked: Record<string, string> = {};
    for (const key of ['documentId', 'nodeId'] as const) {
      const item = frame[key];
      if (typeof item === 'string' && item.length <= 128) picked[key] = item;
    }
    if (Object.keys(picked).length > 0) frames.push(picked);
  }
  return frames.length > 0 ? frames : null;
};

const textLength = (value: unknown): number | null => {
  if (typeof value === 'string') return value.length;
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value).length;
  } catch {
    return null;
  }
};

/**
 * Whitelist-based stripping: only the keys above (plus usage, position, sizes) are carried over; every other
 * top-level key — prompt, answer, text, payload, value, options, result, … — is replaced by `<key>Length`.
 * An `error` entry additionally keeps its own `error` message (ours, not user content), cut to 1 KB.
 */
const stripData = (
  kind: TJournalKind,
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null => {
  if (!data) return null;
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SAFE_SCALAR_KEYS.has(key) && isSafeScalar(value)) {
      stripped[key] = value;
    } else if (key === 'usage') {
      const usage = pickUsage(value);
      if (usage) stripped['usage'] = usage;
    } else if (key === 'position') {
      const position = pickPosition(value);
      if (position) stripped['position'] = position;
    } else if (kind === 'error' && key === 'error' && typeof value === 'string') {
      stripped['error'] = truncateText(value, MAX_MESSAGE_LENGTH);
    } else {
      const length = textLength(value);
      if (length !== null) stripped[`${key}Length`] = length;
    }
  }
  return Object.keys(stripped).length > 0 ? stripped : null;
};

const strippedMessage = (kind: TJournalKind, message: string): string => {
  if (kind === 'error') return truncateText(message, MAX_MESSAGE_LENGTH);
  return `${kind} (${message.length} chars, text not stored)`;
};

const isKind = (value: string): value is TJournalKind => (JOURNAL_KINDS as readonly string[]).includes(value);
const isLevel = (value: string): value is TJournalLevel => (JOURNAL_LEVELS as readonly string[]).includes(value);

/**
 * The one place that turns what a producer sent into stored rows: validates the enums, caps `message`/`data`,
 * applies the project's text policy. An entry with an unknown kind/level or no workflow/source key is
 * dropped (never throws — the journal must not fail a producer's batch over one bad entry).
 */
export const prepareJournalEntries = (
  entries: readonly IRunJournalEntryInput[],
  options: IPrepareJournalOptions,
): IRunJournalRow[] => {
  const rows: IRunJournalRow[] = [];
  for (const entry of entries) {
    if (!isKind(entry.kind) || !isLevel(entry.level)) continue;
    if (!entry.workflowId || !entry.sourceKey) continue;
    const { kind, level } = entry;
    const rawMessage = typeof entry.message === 'string' ? entry.message : '';
    let message: string;
    let data: Record<string, unknown> | null;
    let truncated: boolean;
    if (options.storeTexts) {
      message = truncateText(rawMessage, MAX_MESSAGE_LENGTH);
      truncated = rawMessage.length > MAX_MESSAGE_LENGTH;
      if (entry.data && isRecord(entry.data)) {
        const limited = limitData(entry.data);
        data = limited.data;
        truncated = truncated || limited.truncated;
      } else {
        data = null;
      }
    } else {
      message = strippedMessage(kind, rawMessage);
      const stripped = stripData(kind, isRecord(entry.data) ? entry.data : null);
      data = stripped;
      truncated = kind === 'error' && rawMessage.length > MAX_MESSAGE_LENGTH;
    }
    // Epoch milliseconds; anything else falls back to the receive time.
    const parsed = typeof entry.ts === 'number' ? new Date(entry.ts) : null;
    const ts = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
    rows.push({
      projectId: options.projectId,
      env: options.env,
      buildId: options.buildId,
      workflowId: entry.workflowId,
      runId: entry.runId ?? null,
      documentId: entry.documentId ?? null,
      nodeId: entry.nodeId ?? null,
      vendor: entry.vendor ?? null,
      kind,
      level,
      message,
      data,
      truncated,
      textsStripped: !options.storeTexts,
      ts,
      sourceKey: entry.sourceKey,
    });
  }
  return rows;
};
