import {
  RUN_JOURNAL_KINDS,
  RUN_JOURNAL_LEVELS,
  type IRunJournalEntry,
  type IRunJournalPage,
  type IRunJournalWireEntry,
  type TRunJournalEnv,
  type TRunJournalKind,
  type TRunJournalLevel,
} from '@falang/workflow-dto';

// The journal contract lives in `@falang/workflow-dto` (ADR 0059 (private)); these are the backend's local names for it.
export const JOURNAL_KINDS = RUN_JOURNAL_KINDS;
export const JOURNAL_LEVELS = RUN_JOURNAL_LEVELS;
export type TJournalKind = TRunJournalKind;
export type TJournalLevel = TRunJournalLevel;
export type TJournalEnv = TRunJournalEnv;
export type IRunJournalEntryDto = IRunJournalEntry;
export type { IRunJournalPage };

/** One entry as a producer sends it, before validation: the wire shape with every optional field loosened (a backend-side producer omits them). */
export type IRunJournalEntryInput = Pick<IRunJournalWireEntry, 'workflowId' | 'sourceKey' | 'message' | 'ts'> &
  Partial<Pick<IRunJournalWireEntry, 'runId' | 'data' | 'documentId' | 'nodeId' | 'vendor'>> & {
    readonly kind: string;
    readonly level: string;
  };

/** A ready-to-store row (everything validated, limited and policy-applied). */
export interface IRunJournalRow {
  readonly projectId: string;
  readonly env: TJournalEnv;
  readonly buildId: string | null;
  readonly workflowId: string;
  readonly runId: string | null;
  readonly documentId: string | null;
  readonly nodeId: string | null;
  readonly vendor: string | null;
  readonly kind: TJournalKind;
  readonly level: TJournalLevel;
  readonly message: string;
  readonly data: Record<string, unknown> | null;
  readonly truncated: boolean;
  readonly textsStripped: boolean;
  readonly ts: Date;
  readonly sourceKey: string;
}

export interface IRunJournalListOptions {
  /** Last seen entry id (exclusive). */
  readonly after?: string;
  readonly limit: number;
}
