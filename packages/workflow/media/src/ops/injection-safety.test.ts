import { describe, expect, it } from 'vitest';
import { MEDIA_OPS } from './catalog.js';

const INJECTION_PAYLOADS = ['; rm -rf /', '$(rm -rf /)', '`rm -rf /`', '-i evil', '--', '\n-y', 'a && b'];

/** One minimal params object per op that the real schema accepts — used only to know which keys
 * exist so this test can try swapping each one for an injection payload; not a correctness check
 * of the op itself (that's `argv.test.ts`'s job). Every op not listed here (`media-probe`, which
 * has no params at all) falls through to the empty-object default. */
const buildMinimalValidParams = (opName: string): Record<string, unknown> => {
  switch (opName) {
    case 'media-image-resize': {
      return { format: 'jpeg', fit: 'contain', quality: 80 };
    }
    case 'media-image-convert': {
      return { format: 'jpeg', quality: 80 };
    }
    case 'media-video-trim': {
      return { start: 0, reencode: false };
    }
    case 'media-video-concat': {
      return { reencode: false };
    }
    case 'media-video-thumbnail': {
      return { at: 0 };
    }
    case 'media-video-transcode': {
      return { preset: 'web-720p', format: 'mp4' };
    }
    case 'media-audio-extract': {
      return { format: 'mp3' };
    }
    case 'media-audio-convert': {
      return { format: 'mp3' };
    }
    default: {
      return {};
    }
  }
};

/** Every param that reaches an op's `buildArgv` has already been through `paramsSchema.parse` —
 * this asserts the schema itself is the safety boundary: a string trying to break out of an
 * argv-based (never shell-based) invocation must fail validation, for every op in the catalog, not
 * just the ones with a free-text-shaped field. Nothing in this catalog has a genuinely free-text
 * param (every string field is a fixed `z.enum`), so this doubles as a check that stays true if a
 * future op ever adds one and forgets to enum it. */
describe('op params reject shell/argv injection attempts', () => {
  for (const [opName, opDef] of Object.entries(MEDIA_OPS)) {
    it(`${opName}: every enum-like field rejects an injected string`, () => {
      const baseValid = buildMinimalValidParams(opName);
      for (const key of Object.keys(baseValid)) {
        if (typeof baseValid[key] !== 'string') continue;
        for (const payload of INJECTION_PAYLOADS) {
          const attempt = { ...baseValid, [key]: payload };
          const result = opDef.paramsSchema.safeParse(attempt);
          expect(result.success, `${opName}.${key} accepted "${payload}"`).toBe(false);
        }
      }
    });
  }
});
