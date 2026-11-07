import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import {
  handleChatMemberAction,
  handleGroupMemberUpdate,
  isVkMemberAction,
  mapChatMemberEvent,
  mapGroupMemberEvent,
  type TVkRawActionMessage,
} from './vk-member-events.js';

const doc = (id: string, triggerName: string): IIntegrationDocumentRecord => {
  const root: INode = {
    id: `root-${id}`,
    name: TRIGGER_FUNCTION_NAME,
    children: [
      { id: `h-${id}`, name: 'function-header', data: '' },
      {
        id: `b-${id}`,
        name: 'trigger-function-body',
        children: [],
        data: { vendor: 'vk', triggerName, credentialId: 'cred-1' },
      },
      { id: `f-${id}`, name: 'function-footer', data: '' },
    ],
  };
  return { id, name: `fn_${id}`, data: null, root };
};

const buildCtx = (
  documents: IIntegrationDocumentRecord[],
  overrides: Partial<IIntegrationBackendContext> = {},
): IIntegrationBackendContext =>
  ({
    vendor: 'vk',
    credentialId: 'cred-1',
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi.fn().mockResolvedValue(documents),
    reportJournalProblem: vi.fn().mockResolvedValue(null),
    ...overrides,
  }) as unknown as IIntegrationBackendContext;

const action = (type: string, memberId: number, extra: Partial<TVkRawActionMessage> = {}): TVkRawActionMessage => ({
  peer_id: 2_000_000_007,
  from_id: 9,
  date: 1_700_000_000,
  action: { type, member_id: memberId },
  ...extra,
});

describe('mapGroupMemberEvent', () => {
  it('group_join with any join type but request is a "group-member-joined" event', () => {
    for (const joinType of ['join', 'unsure', 'accepted', 'approved']) {
      expect(
        mapGroupMemberEvent({ type: 'group_join', object: { user_id: 5, join_type: joinType } }, 77),
      ).toMatchObject({
        triggerName: 'vk-group-member-joined',
        signalName: 'vkGroupMemberJoined',
        chatKey: 'g77',
        userId: 5,
        payload: { groupId: 77, userId: 5, joinType, self: false },
      });
    }
  });

  it('group_join with join_type request is a "join-request" event of the same struct', () => {
    expect(mapGroupMemberEvent({ type: 'group_join', object: { user_id: 5, join_type: 'request' } }, 77)).toMatchObject(
      {
        triggerName: 'vk-join-request',
        signalName: 'vkJoinRequest',
        payload: { groupId: 77, userId: 5, joinType: 'request', self: false },
      },
    );
  });

  it('group_leave carries self from the event', () => {
    expect(mapGroupMemberEvent({ type: 'group_leave', object: { user_id: 5, self: 1 } }, 77)).toMatchObject({
      triggerName: 'vk-group-member-left',
      payload: { groupId: 77, userId: 5, self: true },
    });
    expect(mapGroupMemberEvent({ type: 'group_leave', object: { user_id: 5, self: 0 } }, 77)?.payload.self).toBe(false);
  });

  it('has no event without a user', () => {
    expect(mapGroupMemberEvent({ type: 'group_join', object: {} }, 77)).toBeUndefined();
    expect(mapGroupMemberEvent({ type: 'group_join', object: { user_id: -3 } }, 77)).toBeUndefined();
  });
});

describe('mapChatMemberEvent', () => {
  it('chat_invite_user: the member, who added them (from_id) and not via a link', () => {
    expect(mapChatMemberEvent(action('chat_invite_user', 5))).toEqual({
      triggerName: 'vk-chat-member-joined',
      signalName: 'vkChatMemberJoined',
      chatKey: '2000000007',
      userId: 5,
      payload: { chat: { id: 2_000_000_007, type: 'chat' }, userId: 5, byId: 9, viaLink: false, date: 1_700_000_000 },
    });
  });

  it('chat_invite_user_by_link sets viaLink', () => {
    expect(mapChatMemberEvent(action('chat_invite_user_by_link', 5, { from_id: 5 }))?.payload).toMatchObject({
      viaLink: true,
      byId: 5,
    });
  });

  it('chat_kick_user is a "left" event; a self-leave has member_id equal to from_id', () => {
    expect(mapChatMemberEvent(action('chat_kick_user', 5))).toMatchObject({
      triggerName: 'vk-chat-member-left',
      payload: { userId: 5, byId: 9, viaLink: false },
    });
    expect(mapChatMemberEvent(action('chat_kick_user', 5, { from_id: 5 }))?.payload).toMatchObject({
      userId: 5,
      byId: 5,
    });
  });

  it('skips a negative member_id (an e-mail invite or a community) and other action types', () => {
    expect(mapChatMemberEvent(action('chat_invite_user', -12))).toBeUndefined();
    expect(mapChatMemberEvent(action('chat_title_update', 5))).toBeUndefined();
    expect(isVkMemberAction(action('chat_pin_message', 5))).toBe(false);
    expect(isVkMemberAction(action('chat_kick_user', 5))).toBe(true);
    expect(isVkMemberAction({ peer_id: 1 })).toBe(false);
  });
});

describe('handleGroupMemberUpdate', () => {
  it('signals every bound trigger of the kind with a per-event workflow id built on event_id', async () => {
    const ctx = buildCtx([
      doc('a', 'vk-group-member-joined'),
      doc('b', 'vk-group-member-left'),
      doc('c', 'vk-trigger'),
    ]);
    await handleGroupMemberUpdate(ctx, {
      type: 'group_join',
      event_id: 'abc123',
      group_id: 77,
      object: { user_id: 5, join_type: 'join' },
    });
    expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'vk-a-g77-5-abc123',
      workflowType: 'fn_a',
      signalName: 'vkGroupMemberJoined',
      signalArgs: [{ groupId: 77, userId: 5, joinType: 'join', self: false }],
    });
  });

  it('a numeric event_id (Callback API) is used as is; the group id falls back to the target state', async () => {
    const ctx = buildCtx([doc('a', 'vk-group-member-left')]);
    await handleGroupMemberUpdate(ctx, { type: 'group_leave', event_id: 654_321, object: { user_id: 5, self: 1 } }, 88);
    expect(vi.mocked(ctx.signalWorkflow).mock.calls[0][0].workflowId).toBe('vk-a-g88-5-654321');
  });

  it('journals an event no trigger is bound to', async () => {
    const ctx = buildCtx([doc('c', 'vk-trigger')]);
    await handleGroupMemberUpdate(ctx, {
      type: 'group_join',
      event_id: 'e',
      group_id: 77,
      object: { user_id: 5, join_type: 'request' },
    });
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'vk-unbound-g77', level: 'info' }),
    );
  });

  it('is dropped without a trace in sandbox mode', async () => {
    const ctx = buildCtx([doc('a', 'vk-group-member-joined')], { sharedIngress: { subscribe: vi.fn() } });
    await handleGroupMemberUpdate(ctx, {
      type: 'group_join',
      event_id: 'e',
      group_id: 77,
      object: { user_id: 5, join_type: 'join' },
    });
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).not.toHaveBeenCalled();
  });
});

describe('handleChatMemberAction', () => {
  it('signals the chat triggers with <doc>-<peer_id>-<userId>-<event_id>', async () => {
    const ctx = buildCtx([doc('a', 'vk-chat-member-joined')]);
    await handleChatMemberAction(ctx, { type: 'message_new', event_id: 'ev9' }, action('chat_invite_user', 5));
    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'vk-a-2000000007-5-ev9',
      workflowType: 'fn_a',
      signalName: 'vkChatMemberJoined',
      signalArgs: [
        { chat: { id: 2_000_000_007, type: 'chat' }, userId: 5, byId: 9, viaLink: false, date: 1_700_000_000 },
      ],
    });
  });

  it('a negative member_id is journaled as info and signals nothing', async () => {
    const ctx = buildCtx([doc('a', 'vk-chat-member-joined')]);
    await handleChatMemberAction(ctx, { type: 'message_new', event_id: 'ev9' }, action('chat_invite_user', -3));
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(expect.objectContaining({ level: 'info' }));
  });
});
