import { describe, expect, it } from 'vitest';
import { toTelegramMessage, type ITelegramRawMessage } from './telegram-message-mapper.js';

describe('toTelegramMessage', () => {
  it('maps message_id/date/text/chat verbatim (they already coincide with the camelCase names)', () => {
    const raw: ITelegramRawMessage = {
      message_id: 1,
      date: 1_700_000_000,
      text: 'hi',
      chat: { id: 42, type: 'private' },
    };
    expect(toTelegramMessage(raw)).toEqual({
      messageId: 1,
      date: 1_700_000_000,
      text: 'hi',
      chat: { id: 42, type: 'private' },
    });
  });

  it('maps caption (present on media messages, not text ones)', () => {
    const raw: ITelegramRawMessage = { message_id: 2, date: 0, caption: 'a photo', chat: { id: 1, type: 'private' } };
    expect(toTelegramMessage(raw).caption).toBe('a photo');
  });

  it('maps from.is_bot/from.first_name (real pre-existing bug: these never matched the raw field names)', () => {
    const raw: ITelegramRawMessage = {
      message_id: 3,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 99, is_bot: false, first_name: 'Ada', username: 'ada' },
    };
    expect(toTelegramMessage(raw).from).toEqual({ id: 99, isBot: false, firstName: 'Ada', username: 'ada' });
  });

  it('leaves from undefined when the raw message has none', () => {
    const raw: ITelegramRawMessage = { message_id: 4, date: 0, chat: { id: 1, type: 'private' } };
    expect(toTelegramMessage(raw).from).toBeUndefined();
  });

  it('maps a bot user (is_bot: true) too', () => {
    const raw: ITelegramRawMessage = {
      message_id: 5,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 7, is_bot: true, first_name: 'Bot' },
    };
    expect(toTelegramMessage(raw).from).toEqual({ id: 7, isBot: true, firstName: 'Bot' });
  });
});
