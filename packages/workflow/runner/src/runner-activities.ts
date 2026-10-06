import { ACTIVITY_JOURNAL_EXPORT, ACTIVITY_PARAMS_EXPORT, ACTIVITY_VENDORS_EXPORT } from '@falang/workflow-dto';
import { wrapActivitiesWithJournal, type IActivityJournalSpec } from './journal-activities.js';
import type { IJournalSink } from './journal-types.js';
import { wrapActivitiesWithEgressVendor } from './wrap-activities.js';

/**
 * Builds the worker's activities from a loaded compiled module: egress-vendor wrapping always, and — when a journal
 * buffer exists — the run-journal wrapper on top (ADR 0059). Reads `__falangActivityVendors`, `__falangActivityJournal`
 * and `__falangActivityParams` before they are stripped.
 */
export const buildRunnerActivities = (loaded: object, journal: IJournalSink | null): Record<string, unknown> => {
  const meta = loaded as Record<string, unknown>;
  const egressWrapped = wrapActivitiesWithEgressVendor(loaded);
  if (!journal) return egressWrapped;
  return wrapActivitiesWithJournal(egressWrapped, {
    buffer: journal,
    vendors: (meta[ACTIVITY_VENDORS_EXPORT] ?? {}) as Record<string, string>,
    specs: (meta[ACTIVITY_JOURNAL_EXPORT] ?? {}) as Record<string, IActivityJournalSpec>,
    params: (meta[ACTIVITY_PARAMS_EXPORT] ?? {}) as Record<string, string[]>,
  });
};
