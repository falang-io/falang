import type { IRunJournalWireEntry } from '@falang/workflow-dto';

// The journal contract lives in `@falang/workflow-dto` (ADR 0059 (private)); these are the runner's local names for it.
export {
  RUN_JOURNAL_KINDS as JOURNAL_KINDS,
  RUN_JOURNAL_LEVELS as JOURNAL_LEVELS,
  type IRunJournalSinkEntry as IJournalSinkEntry,
  type IRunJournalWireEntry as IJournalWireEntry,
  type TRunJournalKind as TJournalKind,
  type TRunJournalLevel as TJournalLevel,
} from '@falang/workflow-dto';

/** Anything the activity wrapper / sink pushes into — `JournalBuffer` implements it. */
export interface IJournalSink {
  push(entry: IRunJournalWireEntry): void;
}
