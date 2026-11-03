import { describe, expect, it } from 'vitest';
import { parseVkPayload, toVkMessage, vkChatTypeOf } from './vk-message-mapper.js';

describe('vk message mapper', () => {
  it('maps a plain message', () => {
    expect(
      toVkMessage(
        { id: 5, conversation_message_id: 2, date: 100, peer_id: 42, from_id: 42, text: 'hello', payload: null },
        { id: 42, firstName: 'Ann' },
      ),
    ).toEqual({
      messageId: 5,
      conversationMessageId: 2,
      text: 'hello',
      date: 100,
      chat: { id: 42, type: 'private' },
      from: { id: 42, firstName: 'Ann' },
      payload: null,
    });
  });

  it('turns a "Start" press into /start, with the ref when there is one', () => {
    const base = { id: 1, peer_id: 7, text: 'Начать', payload: '{"command":"start"}' };
    expect(toVkMessage(base, null).text).toBe('/start');
    expect(toVkMessage({ ...base, ref: 'promo' }, null)).toMatchObject({ text: '/start promo', ref: 'promo' });
  });

  it('classifies peers', () => {
    expect(vkChatTypeOf(7)).toBe('private');
    expect(vkChatTypeOf(2_000_000_003)).toBe('chat');
    expect(vkChatTypeOf(-9)).toBe('group');
  });

  it('parses only JSON objects as payloads', () => {
    expect(parseVkPayload('{"a":1}')).toEqual({ a: 1 });
    expect(parseVkPayload('[1]')).toBeNull();
    expect(parseVkPayload('nope')).toBeNull();
    expect(parseVkPayload(null)).toBeNull();
  });
});
