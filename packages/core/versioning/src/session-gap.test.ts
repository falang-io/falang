import { assert, describe, it } from 'vitest';
import { buildAutoVersionMessage, DEFAULT_AUTO_VERSION_GAP_MS, isSessionGap } from './session-gap.js';

describe('isSessionGap', () => {
  it('is true when there is no prior edit at all', () => {
    assert.isTrue(isSessionGap(null, Date.now()));
  });

  it('is false when the last edit is within the gap', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    // 2h ago
    const lastEditedAt = new Date('2026-09-18T10:00:00.000Z');
    assert.isFalse(isSessionGap(lastEditedAt, now));
  });

  it('is true when the last edit is older than the gap', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    // 4h ago
    const lastEditedAt = new Date('2026-09-18T08:00:00.000Z');
    assert.isTrue(isSessionGap(lastEditedAt, now));
  });

  it('is false exactly at the boundary (strictly greater-than, not >=)', () => {
    const now = 10_000 + DEFAULT_AUTO_VERSION_GAP_MS;
    assert.isFalse(isSessionGap(new Date(10_000), now));
    assert.isTrue(isSessionGap(new Date(10_000), now + 1));
  });

  it('accepts an ISO string for lastEditedAt', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    assert.isTrue(isSessionGap('2026-09-18T08:00:00.000Z', now));
    assert.isFalse(isSessionGap('2026-09-18T11:00:00.000Z', now));
  });

  it('accepts a numeric now and a custom gapMs', () => {
    assert.isFalse(isSessionGap(new Date(0), 1000, 2000));
    assert.isTrue(isSessionGap(new Date(0), 2001, 2000));
  });
});

describe('buildAutoVersionMessage', () => {
  it('formats as "Auto-save YYYY-MM-DD HH:mm" in local time', () => {
    // month is 0-indexed: September
    const now = new Date(2026, 8, 17, 14, 3, 59);
    assert.equal(buildAutoVersionMessage(now), 'Auto-save 2026-09-17 14:03');
  });

  it('zero-pads single-digit month/day/hour/minute', () => {
    const now = new Date(2026, 0, 5, 9, 7, 0);
    assert.equal(buildAutoVersionMessage(now), 'Auto-save 2026-01-05 09:07');
  });
});
