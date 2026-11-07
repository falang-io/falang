import { describe, expect, it } from 'vitest';
import { telegramSandboxAdapter as adapter } from './telegram-sandbox.js';

describe('telegram sandbox adapter — community updates (ADR 0076 (private))', () => {
  const chat = { id: -100, type: 'supergroup' };

  it('ignores chat_member / chat_join_request / my_chat_member updates without errors', () => {
    for (const update of [
      { update_id: 1, chat_member: { chat } },
      { update_id: 2, chat_join_request: { chat, from: { id: 1 } } },
      { update_id: 3, my_chat_member: { chat } },
    ]) {
      expect(adapter.describeUpdate(update)).toBeNull();
    }
  });

  it('describes a group service message as a non-private chat, which the host never binds', () => {
    const described = adapter.describeUpdate({
      update_id: 4,
      message: { message_id: 1, chat, new_chat_members: [{ id: 5 }] },
    });
    expect(described?.isPrivateChat).toBe(false);
  });
});
