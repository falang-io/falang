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

  it('maps chat.title and entities (message text entities only, not caption_entities)', () => {
    const raw: ITelegramRawMessage = {
      message_id: 6,
      date: 0,
      text: 'see https://x.io and docs',
      entities: [
        { type: 'url', offset: 4, length: 12 },
        { type: 'text_link', offset: 21, length: 4, url: 'https://docs.io' },
      ],
      chat: { id: -100, type: 'supergroup', title: 'My group' },
    };
    const mapped = toTelegramMessage(raw);
    expect(mapped.chat).toEqual({ id: -100, type: 'supergroup', title: 'My group' });
    expect(mapped.entities).toEqual([
      { type: 'url', offset: 4, length: 12 },
      { type: 'text_link', offset: 21, length: 4, url: 'https://docs.io' },
    ]);
  });

  it('leaves entities undefined when the message has none', () => {
    const raw = { message_id: 7, date: 0, caption: 'c', chat: { id: 1, type: 'private' } } as ITelegramRawMessage;
    expect(toTelegramMessage(raw).entities).toBeUndefined();
  });
});
