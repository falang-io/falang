import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTelegramBackend } from './telegram-backend.js';
import {
  buildCommunityCtx,
  groupMessage,
  jsonResponse,
  postUpdate,
  triggerDoc,
  type TTestCtx,
} from './telegram-community-test-helpers.js';
import type { ITelegramRawUser } from './telegram-message-mapper.js';
import {
  classifyChatMemberUpdate,
  classifyServiceMessage,
  MemberEventDeduplicator,
  MEMBER_EVENT_DEDUP_WINDOW_MS,
  type ITelegramRawChatMember,
} from './telegram-member-events.js';

const chat = { id: -100, type: 'supergroup', title: 'Chat' };
const bob: ITelegramRawUser = { id: 7, is_bot: false, first_name: 'Bob', username: 'bob' };
const admin: ITelegramRawUser = { id: 1, is_bot: false, first_name: 'Admin' };

const member = (status: string, extra: Partial<ITelegramRawChatMember> = {}): ITelegramRawChatMember => ({
  status,
  user: bob,
  ...extra,
});

const chatMemberUpdate = (
  oldStatus: ITelegramRawChatMember,
  newStatus: ITelegramRawChatMember,
  from = bob,
  extra: Record<string, unknown> = {},
): Parameters<typeof classifyChatMemberUpdate>[0] => ({
  chat,
  from,
  date: 1000,
  old_chat_member: oldStatus,
  new_chat_member: newStatus,
  ...extra,
});

describe('classifyChatMemberUpdate', () => {
  it('maps left -> member to joined, with the invite link string and via_join_request', () => {
    const event = classifyChatMemberUpdate(
      chatMemberUpdate(member('left'), member('member'), bob, {
        invite_link: { invite_link: 'https://t.me/+abc', name: 'x' },
        via_join_request: true,
      }),
    );
    expect(event).toEqual({
      kind: 'joined',
      chatId: -100,
      userId: 7,
      payload: {
        chat: { id: -100, type: 'supergroup', title: 'Chat' },
        user: { id: 7, isBot: false, firstName: 'Bob', username: 'bob' },
        by: undefined,
        date: 1000,
        kicked: false,
        inviteLink: 'https://t.me/+abc',
        viaJoinRequest: true,
      },
    });
  });

  it('sets by when someone else added the user', () => {
    const event = classifyChatMemberUpdate(chatMemberUpdate(member('left'), member('member'), admin));
    expect(event?.payload.by).toEqual({ id: 1, isBot: false, firstName: 'Admin', username: undefined });
  });

  it('counts a restricted member with is_member as present, both as a join and as a non-leave', () => {
    expect(
      classifyChatMemberUpdate(chatMemberUpdate(member('left'), member('restricted', { is_member: true })))?.kind,
    ).toBe('joined');
    expect(
      classifyChatMemberUpdate(chatMemberUpdate(member('left'), member('restricted', { is_member: false }))),
    ).toBeNull();
    // member -> restricted(is_member) is neither a join nor a leave
    expect(
      classifyChatMemberUpdate(chatMemberUpdate(member('member'), member('restricted', { is_member: true }))),
    ).toBeNull();
  });

  it.each([
    ['left', false],
    ['kicked', true],
  ])('maps member -> %s to left (kicked: %s)', (status, kicked) => {
    const event = classifyChatMemberUpdate(chatMemberUpdate(member('member'), member(status), admin));
    expect(event?.kind).toBe('left');
    expect(event?.payload.kicked).toBe(kicked);
    expect(event?.payload.by?.id).toBe(1);
  });

  it('ignores promotions and a ban of someone who had already left', () => {
    expect(classifyChatMemberUpdate(chatMemberUpdate(member('member'), member('administrator')))).toBeNull();
    expect(classifyChatMemberUpdate(chatMemberUpdate(member('left'), member('kicked')))).toBeNull();
  });
});

describe('classifyServiceMessage', () => {
  it('yields one joined event per new_chat_members entry, with by only when someone else added them', () => {
    const events = classifyServiceMessage({
      message_id: 3,
      date: 50,
      chat,
      from: admin,
      new_chat_members: [bob, { id: 8, is_bot: false, first_name: 'Eve' }],
    });
    expect(events.map((event) => [event.kind, event.userId, event.payload.by?.id])).toEqual([
      ['joined', 7, 1],
      ['joined', 8, 1],
    ]);
    const self = classifyServiceMessage({ message_id: 4, date: 0, chat, from: bob, new_chat_members: [bob] });
    expect(self[0].payload.by).toBeUndefined();
  });

  it('maps left_chat_member to left, kicked when removed by another user', () => {
    const left = classifyServiceMessage({ message_id: 5, date: 0, chat, from: bob, left_chat_member: bob });
    expect(left[0]).toMatchObject({ kind: 'left', payload: { kicked: false } });
    const removed = classifyServiceMessage({ message_id: 6, date: 0, chat, from: admin, left_chat_member: bob });
    expect(removed[0]).toMatchObject({ kind: 'left', payload: { kicked: true } });
  });
});

describe('MemberEventDeduplicator', () => {
  it('drops the same (chat, user, kind) within 10 seconds, not other users or kinds, and lets it through after', () => {
    const dedup = new MemberEventDeduplicator();
    expect(dedup.isDuplicate(1, 2, 'joined', 0)).toBe(false);
    expect(dedup.isDuplicate(1, 2, 'joined', 9_000)).toBe(true);
    expect(dedup.isDuplicate(1, 3, 'joined', 9_000)).toBe(false);
    expect(dedup.isDuplicate(1, 2, 'left', 9_000)).toBe(false);
    expect(dedup.isDuplicate(1, 2, 'joined', MEMBER_EVENT_DEDUP_WINDOW_MS + 1)).toBe(false);
  });
});

describe('registerTelegramBackend — member events', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const boot = async (...docs: ReturnType<typeof triggerDoc>[]): Promise<TTestCtx> => {
    const ctx = buildCommunityCtx(docs);
    await registerTelegramBackend(ctx);
    return ctx;
  };

  const joinedDoc = triggerDoc({ id: 'j', name: 'onJoin', triggerName: 'telegram-member-joined' });
  const leftDoc = triggerDoc({ id: 'l', name: 'onLeave', triggerName: 'telegram-member-left' });

  it('signals telegram-member-joined with a per-event workflow id and its own signal name', async () => {
    const ctx = await boot(joinedDoc, leftDoc);
    await postUpdate(ctx, {
      update_id: 55,
      chat_member: chatMemberUpdate(member('left'), member('member'), bob),
    });
    expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'tg-j--100-7-55',
      workflowType: 'onJoin',
      signalName: 'telegramMemberJoined',
      signalArgs: [expect.objectContaining({ kicked: false, viaJoinRequest: false })],
    });
  });

  it('signals telegram-member-left with kicked: true for a ban', async () => {
    const ctx = await boot(joinedDoc, leftDoc);
    await postUpdate(ctx, {
      update_id: 56,
      chat_member: chatMemberUpdate(member('member'), member('kicked'), admin),
    });
    expect(ctx.signalWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'tg-l--100-7-56',
        signalName: 'telegramMemberLeft',
        signalArgs: [expect.objectContaining({ kicked: true, by: expect.objectContaining({ id: 1 }) })],
      }),
    );
  });

  it('turns a new_chat_members service message into a joined event and keeps it out of the on-message trigger', async () => {
    const ctx = await boot(joinedDoc, triggerDoc({ id: 'm', name: 'onMessage', triggerName: 'telegram-trigger' }));
    await postUpdate(ctx, {
      update_id: 60,
      message: { message_id: 1, date: 0, chat, from: admin, new_chat_members: [bob] },
    });
    expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
    expect(ctx.signalWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'tg-j--100-7-60', signalName: 'telegramMemberJoined' }),
    );
  });

  it('deduplicates chat_member plus the service message of one join (an admin bot gets both)', async () => {
    const ctx = await boot(joinedDoc);
    await postUpdate(ctx, { update_id: 70, chat_member: chatMemberUpdate(member('left'), member('member'), bob) });
    await postUpdate(ctx, {
      update_id: 71,
      message: { message_id: 1, date: 0, chat, from: bob, new_chat_members: [bob] },
    });
    expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
  });

  it('signals telegram-join-request from chat_join_request', async () => {
    const ctx = await boot(triggerDoc({ id: 'r', name: 'onRequest', triggerName: 'telegram-join-request' }));
    await postUpdate(ctx, {
      update_id: 80,
      chat_join_request: { chat, from: bob, user_chat_id: 777, date: 5, bio: 'hi', invite_link: { invite_link: 'L' } },
    });
    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'tg-r--100-7-80',
      workflowType: 'onRequest',
      signalName: 'telegramJoinRequest',
      signalArgs: [
        {
          chat: { id: -100, type: 'supergroup', title: 'Chat' },
          user: { id: 7, isBot: false, firstName: 'Bob', username: 'bob' },
          userChatId: 777,
          date: 5,
          bio: 'hi',
          inviteLink: 'L',
        },
      ],
    });
  });

  it('journals an info problem when no trigger of the needed kind is bound', async () => {
    const ctx = await boot(leftDoc);
    await postUpdate(ctx, { update_id: 90, chat_member: chatMemberUpdate(member('left'), member('member')) });
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'tg-unbound--100',
        level: 'info',
        data: expect.objectContaining({ errorType: 'NoBoundTrigger', signal: 'telegramMemberJoined' }),
      }),
    );
  });

  it('turns my_chat_member into an info journal line on tg-unbound-<chatId>, never a signal', async () => {
    const ctx = await boot(joinedDoc);
    await postUpdate(ctx, {
      update_id: 91,
      my_chat_member: {
        chat,
        from: admin,
        date: 1,
        old_chat_member: { status: 'left', user: admin },
        new_chat_member: { status: 'administrator', user: admin },
      },
    });
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'tg-unbound--100',
        level: 'info',
        message: expect.stringContaining('added to chat "Chat"'),
      }),
    );
  });

  it('still routes an ordinary group message to the on-message trigger', async () => {
    const ctx = await boot(joinedDoc, triggerDoc({ id: 'm', name: 'onMessage', triggerName: 'telegram-trigger' }));
    await postUpdate(ctx, { update_id: 92, message: groupMessage('hello') });
    expect(ctx.signalWorkflow).toHaveBeenCalledWith(expect.objectContaining({ signalName: 'telegramMessage' }));
  });
});
