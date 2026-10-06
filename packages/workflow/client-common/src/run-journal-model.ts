import type { IApiRunJournalEntry, TApiRunJournalKind, TApiRunJournalLevel } from './api-types.js';

export const JOURNAL_KINDS: readonly TApiRunJournalKind[] = [
  'log',
  'trigger',
  'user-input',
  'ai',
  'message-out',
  'error',
];
export const JOURNAL_LEVELS: readonly TApiRunJournalLevel[] = ['info', 'warn', 'error'];

export interface IJournalFilters {
  /** Empty = every kind. */
  readonly kinds: readonly TApiRunJournalKind[];
  /** `null` = every level. */
  readonly level: TApiRunJournalLevel | null;
  /** Shows `warn` and `error` only. */
  readonly errorsOnly: boolean;
}

export const NO_JOURNAL_FILTERS: IJournalFilters = { kinds: [], level: null, errorsOnly: false };

const compareIds = (left: string, right: string): number => {
  if (left.length !== right.length) return left.length - right.length;
  return left.localeCompare(right);
};

/** Display order: producer time, then insertion id (ids are digit strings of a bigint — compared numerically). */
export const compareJournalEntries = (left: IApiRunJournalEntry, right: IApiRunJournalEntry): number =>
  Date.parse(left.ts) - Date.parse(right.ts) || compareIds(left.id, right.id);

/** Merges `incoming` into `existing` by id (a poll may overlap a page boundary) and returns them sorted for display by `(ts, id)`. */
export const mergeJournalEntries = (
  existing: readonly IApiRunJournalEntry[],
  incoming: readonly IApiRunJournalEntry[],
): IApiRunJournalEntry[] => {
  const byId = new Map<string, IApiRunJournalEntry>();
  for (const entry of existing) byId.set(entry.id, entry);
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].toSorted(compareJournalEntries);
};

/** The `after` cursor for the next request: the greatest id seen (the server pages in id order), `null` for an empty list. */
export const lastJournalEntryId = (entries: readonly IApiRunJournalEntry[]): string | null => {
  let max: string | null = null;
  for (const entry of entries) if (max === null || compareIds(entry.id, max) > 0) max = entry.id;
  return max;
};

export const filterJournalEntries = (
  entries: readonly IApiRunJournalEntry[],
  filters: IJournalFilters,
): IApiRunJournalEntry[] =>
  entries.filter((entry) => {
    if (filters.kinds.length > 0 && !filters.kinds.includes(entry.kind)) return false;
    if (filters.level !== null && entry.level !== filters.level) return false;
    if (filters.errorsOnly && entry.level === 'info') return false;
    return true;
  });

/** `data` keys whose string values are human text (prompts, answers, …) — shown as readable text instead of JSON. */
const TEXT_KEYS = new Set([
  'prompt',
  'answer',
  'text',
  'message',
  'error',
  'result',
  'systemPrompt',
  'question',
  'value',
]);

export interface ISplitJournalData {
  readonly texts: readonly { readonly key: string; readonly value: string }[];
  /** Everything else; `null` when nothing is left. */
  readonly rest: Record<string, unknown> | null;
}

export const splitJournalData = (data: Record<string, unknown> | null): ISplitJournalData => {
  if (!data) return { texts: [], rest: null };
  const texts: { key: string; value: string }[] = [];
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (TEXT_KEYS.has(key) && typeof value === 'string') texts.push({ key, value });
    else rest[key] = value;
  }
  return { texts, rest: Object.keys(rest).length > 0 ? rest : null };
};
