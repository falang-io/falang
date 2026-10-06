/* oxlint-disable no-plusplus, no-undefined, no-void, no-empty-function, require-await, no-inline-comments, no-non-null-assertion, no-explicit-any */
import { describe, expect, it } from 'vitest';
import { buildRunnerActivities } from './runner-activities.js';

describe('buildRunnerActivities', () => {
  const loaded = {
    __falangActivityVendors: { a: 'v' },
    __falangActivityJournal: { a: { kind: 'message-out', args: ['text'] } },
    __falangActivityParams: { a: ['text'] },
    a: async (text: string) => text,
  };

  it('strips __falang metadata with and without a journal', () => {
    expect(Object.keys(buildRunnerActivities(loaded, null))).toEqual(['a']);
    expect(Object.keys(buildRunnerActivities(loaded, { push: () => {} }))).toEqual(['a']);
  });
});
