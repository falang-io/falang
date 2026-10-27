import { describe, expect, it } from 'vitest';
import {
  buildActivityProxyGroupCode,
  DEFAULT_ACTIVITY_MAXIMUM_ATTEMPTS,
  groupActivityProxyEntries,
} from './activity-proxy-groups.js';

const code = (options?: Parameters<typeof groupActivityProxyEntries>[0][number]['options']): string => {
  const [group] = groupActivityProxyEntries([{ name: 'act', signature: 'act(): Promise<void>', options }]);
  if (!group) throw new Error('no group');
  return buildActivityProxyGroupCode(group);
};

describe('default activity retries (security audit P1-4)', () => {
  it('gives an activity without a retry policy a bounded number of attempts', () => {
    expect(DEFAULT_ACTIVITY_MAXIMUM_ATTEMPTS).toBe(5);
    expect(code()).toContain('retry: { maximumAttempts: 5 },');
    expect(code({ kind: 'regular', startToCloseTimeout: '1 minute' })).toContain('retry: { maximumAttempts: 5 },');
  });

  it('keeps a descriptor-supplied attempt count, including 0 (unlimited)', () => {
    expect(code({ retry: { maximumAttempts: 3 } })).toContain('retry: { maximumAttempts: 3 },');
    expect(code({ retry: { maximumAttempts: 0 } })).toContain('retry: { maximumAttempts: 0 },');
  });

  it('adds the default attempts next to a policy that only lists non-retryable errors', () => {
    expect(code({ retry: { nonRetryableErrorTypes: ['ValidationError'] } })).toContain(
      'retry: { maximumAttempts: 5, nonRetryableErrorTypes: ["ValidationError"] },',
    );
  });

  it('groups entries with and without an explicit default policy together', () => {
    const groups = groupActivityProxyEntries([
      { name: 'a', signature: 'a(): Promise<void>' },
      { name: 'b', signature: 'b(): Promise<void>', options: { retry: { maximumAttempts: 5 } } },
    ]);
    expect(groups).toHaveLength(1);
  });
});
