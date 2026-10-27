import { describe, expect, it } from 'vitest';
import { MEDIA_OPS } from './catalog.js';

describe('op parameter upper bounds', () => {
  it.each([
    ['media-image-resize', { width: 100_000 }],
    ['media-image-resize', { height: 8193 }],
    ['media-video-thumbnail', { width: 100_000 }],
    ['media-video-thumbnail', { at: 1e9 }],
    ['media-video-trim', { start: 1e9 }],
    ['media-video-trim', { start: 0, duration: 1e9 }],
  ] as const)('%s rejects %j', (op, params) => {
    expect(MEDIA_OPS[op].paramsSchema.safeParse(params).success).toBe(false);
  });

  it('still accepts sane values', () => {
    expect(MEDIA_OPS['media-image-resize'].paramsSchema.safeParse({ width: 8192, height: 100 }).success).toBe(true);
    expect(MEDIA_OPS['media-video-trim'].paramsSchema.safeParse({ start: 10, duration: 5 }).success).toBe(true);
  });
});
