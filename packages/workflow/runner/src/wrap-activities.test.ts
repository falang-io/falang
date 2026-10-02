import { getEgressVendor } from '@falang/workflow-egress';
import { describe, expect, it } from 'vitest';
import { wrapActivitiesWithEgressVendor } from './wrap-activities.js';

describe('wrapActivitiesWithEgressVendor', () => {
  it('drops __falang* keys and runs vendor activities in their vendor context', async () => {
    const wrapped = wrapActivitiesWithEgressVendor({
      __falangActivityVendors: { tgSend: 'telegram' },
      logActivity: (m: string) => `${m}:${String(getEgressVendor())}`,
      tgSend: (a: number, b: number) => Promise.resolve(`${a + b}:${String(getEgressVendor())}`),
    });
    expect(Object.keys(wrapped).toSorted()).toEqual(['logActivity', 'tgSend']);
    expect(await (wrapped.tgSend as (a: number, b: number) => Promise<string>)(1, 2)).toBe('3:telegram');
    expect((wrapped.logActivity as (m: string) => string)('x')).toBe('x:undefined');
  });

  it('works without a vendor map', () => {
    expect(Object.keys(wrapActivitiesWithEgressVendor({ a: () => 1 }))).toEqual(['a']);
  });
});
