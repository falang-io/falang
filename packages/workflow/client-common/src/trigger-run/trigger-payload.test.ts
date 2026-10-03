import { describe, expect, it } from 'vitest';
import { buildSamplePayload, parseTriggerPayload } from './trigger-payload.js';

describe('buildSamplePayload', () => {
  const structs: Record<string, Record<string, unknown>> = {
    'telegram/Message': {
      text: { type: 'string' },
      date: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
      chat: { type: 'struct', id: 'telegram/Chat' },
      caption: { type: 'string', optional: true },
      photos: { type: 'array', elementType: { type: 'string' }, dimensions: 1 },
    },
    'telegram/Chat': { id: { type: 'number' }, isForum: { type: 'boolean' } },
    loop: { self: { type: 'struct', id: 'loop' } },
  };
  const resolve = (id: string) => (structs[id] ?? null) as never;

  it('fills required struct properties with empty values and skips optional ones', () => {
    expect(buildSamplePayload({ type: 'struct', id: 'telegram/Message' }, resolve)).toEqual({
      text: '',
      date: 0,
      chat: { id: 0, isForum: false },
      photos: [],
    });
  });

  it('stops at a recursive or unknown struct', () => {
    expect(JSON.stringify(buildSamplePayload({ type: 'struct', id: 'loop' }, resolve))).toBe(
      '{"self":{"self":{"self":{"self":{}}}}}',
    );
    expect(buildSamplePayload({ type: 'struct', id: 'missing' }, resolve)).toEqual({});
    expect(buildSamplePayload({ type: 'any' }, resolve)).toEqual({});
  });
});

describe('parseTriggerPayload', () => {
  it('accepts a JSON object', () => {
    expect(parseTriggerPayload('{"text":"hi"}')).toEqual({ ok: true, payload: { text: 'hi' } });
  });

  it('rejects invalid JSON and non-objects', () => {
    expect(parseTriggerPayload('{text}').ok).toBe(false);
    expect(parseTriggerPayload('[1]').ok).toBe(false);
    expect(parseTriggerPayload('"x"').ok).toBe(false);
    expect(parseTriggerPayload('null').ok).toBe(false);
  });
});
