import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { ITriggerDescriptor } from '@falang/workflow-integrations-common';
import { buildSamplePayload, parseTriggerPayload, resolveTriggerPayloadType } from './trigger-payload.js';

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

describe('resolveTriggerPayloadType', () => {
  const root = (data: unknown): INode =>
    ({
      id: 'r',
      name: 'trigger-function',
      children: [{ id: 'h' }, { id: 'b', name: 'trigger-function-body', data }],
    }) as INode;
  const descriptor = { scopeType: { type: 'any' } } as unknown as ITriggerDescriptor;

  it("prefers the scopeType stored on the body (a table trigger's event struct)", () => {
    const type = { type: 'struct', id: 'table:t1#created' };
    expect(resolveTriggerPayloadType(root({ scopeType: type }), descriptor)).toEqual(type);
  });

  it('falls back to the descriptor, scopeTypeFor first', () => {
    expect(resolveTriggerPayloadType(root({}), descriptor)).toEqual({ type: 'any' });
    const dynamic = {
      ...descriptor,
      scopeTypeFor: (config: Readonly<Record<string, string>>) => ({ type: 'struct', id: config.table }),
    } as unknown as ITriggerDescriptor;
    expect(resolveTriggerPayloadType(root({ triggerConfig: { table: 'x' } }), dynamic)).toEqual({
      type: 'struct',
      id: 'x',
    });
    expect(resolveTriggerPayloadType(root({}), null)).toBeNull();
  });
});
