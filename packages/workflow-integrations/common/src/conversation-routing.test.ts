import { describe, expect, it } from 'vitest';
import {
  buildChatTypeContextField,
  buildConversationContextField,
  buildConversationWorkflowId,
  buildMemberEventWorkflowId,
  chatTypeAdmits,
  resolveChatTypeFilter,
  resolveConversationMode,
  type TChatKind,
  type TChatTypeFilter,
} from './conversation-routing.js';

describe('resolveConversationMode / resolveChatTypeFilter', () => {
  it('reads valid values', () => {
    expect(resolveConversationMode({ conversation: 'per-user' })).toBe('per-user');
    expect(resolveConversationMode({ conversation: 'per-event' })).toBe('per-event');
    expect(resolveChatTypeFilter({ chatType: 'private' })).toBe('private');
    expect(resolveChatTypeFilter({ chatType: 'group' })).toBe('group');
  });
  it('falls back to the defaults for missing, empty and garbage values', () => {
    for (const config of [null, {}, { conversation: '' }, { conversation: 'nope' }] as const) {
      expect(resolveConversationMode(config as Record<string, string>)).toBe('per-chat');
    }
    expect(resolveConversationMode()).toBe('per-chat');
    for (const config of [null, {}, { chatType: '' }, { chatType: 'channel' }] as const) {
      expect(resolveChatTypeFilter(config as Record<string, string>)).toBe('any');
    }
    expect(resolveChatTypeFilter()).toBe('any');
  });
});

describe('chatTypeAdmits', () => {
  it('covers every combination', () => {
    const expected: Record<TChatTypeFilter, Record<TChatKind, boolean>> = {
      any: { private: true, group: true },
      private: { private: true, group: false },
      group: { private: false, group: true },
    };
    for (const filter of Object.keys(expected) as TChatTypeFilter[]) {
      for (const kind of ['private', 'group'] as const) {
        expect(chatTypeAdmits(filter, kind)).toBe(expected[filter][kind]);
      }
    }
  });
});

describe('buildConversationWorkflowId', () => {
  const base = { vendorPrefix: 'tg', documentId: 'doc', chatId: -100 };
  it('builds ids per mode', () => {
    expect(buildConversationWorkflowId({ ...base, mode: 'per-chat' })).toBe('tg-doc--100');
    expect(buildConversationWorkflowId({ ...base, mode: 'per-user', userId: 7 })).toBe('tg-doc--100-7');
    expect(buildConversationWorkflowId({ ...base, chatId: '5', mode: 'per-event', eventKey: 'm42' })).toBe(
      'tg-doc-5-m42',
    );
  });
  it('throws without userId / eventKey', () => {
    expect(() => buildConversationWorkflowId({ ...base, mode: 'per-user' })).toThrow(/userId/);
    expect(() => buildConversationWorkflowId({ ...base, mode: 'per-event' })).toThrow(/eventKey/);
  });
});

describe('buildMemberEventWorkflowId', () => {
  it('builds the member event id', () => {
    expect(
      buildMemberEventWorkflowId({ vendorPrefix: 'vk', documentId: 'd', chatId: 1, userId: '2', eventKey: 'join-3' }),
    ).toBe('vk-d-1-2-join-3');
  });
  it('throws on a missing part', () => {
    expect(() =>
      buildMemberEventWorkflowId({ vendorPrefix: 'vk', documentId: 'd', chatId: 1, userId: '', eventKey: 'e' }),
    ).toThrow(/userId/);
    expect(() =>
      buildMemberEventWorkflowId({
        vendorPrefix: 'vk',
        documentId: 'd',
        chatId: 1,
        userId: 2,
        eventKey: '',
      }),
    ).toThrow(/eventKey/);
  });
});

describe('context field factories', () => {
  it('builds the chatType select', () => {
    const field = buildChatTypeContextField({ label: 'l', any: 'a', private: 'p', group: 'g' });
    expect(field).toMatchObject({ name: 'chatType', kind: 'select', label: 'l', defaultValue: 'any' });
    expect(field.options).toEqual([
      { value: 'any', label: 'a' },
      { value: 'private', label: 'p' },
      { value: 'group', label: 'g' },
    ]);
  });
  it('builds the conversation select', () => {
    const field = buildConversationContextField({ label: 'l', perChat: 'c', perUser: 'u', perEvent: 'e' });
    expect(field).toMatchObject({ name: 'conversation', kind: 'select', defaultValue: 'per-chat' });
    expect(field.options?.map((o) => o.value)).toEqual(['per-chat', 'per-user', 'per-event']);
  });
});
