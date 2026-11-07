import { buildMemberEventWorkflowId, type IIntegrationBackendContext } from '@falang/workflow-integrations-common';
import {
  VK_CHAT_MEMBER_JOINED_SIGNAL_NAME,
  VK_CHAT_MEMBER_JOINED_TRIGGER_NAME,
  VK_CHAT_MEMBER_LEFT_SIGNAL_NAME,
  VK_CHAT_MEMBER_LEFT_TRIGGER_NAME,
  VK_GROUP_MEMBER_JOINED_SIGNAL_NAME,
  VK_GROUP_MEMBER_JOINED_TRIGGER_NAME,
  VK_GROUP_MEMBER_LEFT_SIGNAL_NAME,
  VK_GROUP_MEMBER_LEFT_TRIGGER_NAME,
  VK_JOIN_REQUEST_SIGNAL_NAME,
  VK_JOIN_REQUEST_TRIGGER_NAME,
} from './constants.js';
import { vkChatTypeOf, type IVkRawMessage } from './vk-message-mapper.js';
import { findBoundTriggerFunctions, getTriggerFunctionBodyData, unboundWorkflowId } from './vk-trigger-docs.js';

/** The subset of a VK event the member-event mapping reads. */
export interface IVkMemberUpdate {
  readonly type: string;
  readonly object?: unknown;
  readonly group_id?: number;
  /** Unique per event in both Callback API and Bots Long Poll (a hash string); the dedup / workflow-id key. */
  readonly event_id?: string | number;
}

interface IVkGroupMemberObject {
  readonly user_id?: number;
  readonly join_type?: string;
  readonly self?: number | boolean;
}

interface IVkRawAction {
  readonly type?: string;
  readonly member_id?: number;
}

/** A VK service message of a conversation (`message_new` with `action`). */
export type TVkRawActionMessage = IVkRawMessage & { readonly action?: IVkRawAction };

export interface IVkMemberEvent {
  readonly triggerName: string;
  readonly signalName: string;
  /** Workflow-id chat part: `g<groupId>` for a community event, the `peer_id` for a conversation. */
  readonly chatKey: string;
  readonly userId: number;
  readonly payload: Record<string, unknown>;
}

const CHAT_INVITE_TYPES = new Set(['chat_invite_user', 'chat_invite_user_by_link']);

/** Member events other than a join/leave service message (pin, title, photo, ...) are not an input of any trigger. */
export const isVkMemberAction = (message: TVkRawActionMessage): boolean => {
  const type = message.action?.type;
  return Boolean(type && (CHAT_INVITE_TYPES.has(type) || type === 'chat_kick_user'));
};

/** `group_join` / `group_leave` of the community -> the trigger and payload; `undefined` when it has no user. */
export const mapGroupMemberEvent = (update: IVkMemberUpdate, groupId: number): IVkMemberEvent | undefined => {
  const object = update.object as IVkGroupMemberObject | null | undefined;
  const userId = object?.user_id;
  if (!userId || userId < 0) return;
  if (update.type === 'group_leave') {
    return {
      triggerName: VK_GROUP_MEMBER_LEFT_TRIGGER_NAME,
      signalName: VK_GROUP_MEMBER_LEFT_SIGNAL_NAME,
      chatKey: `g${groupId}`,
      userId,
      payload: { groupId, userId, self: object?.self === 1 || object?.self === true },
    };
  }
  const joinType = object?.join_type ?? 'join';
  const isRequest = joinType === 'request';
  return {
    triggerName: isRequest ? VK_JOIN_REQUEST_TRIGGER_NAME : VK_GROUP_MEMBER_JOINED_TRIGGER_NAME,
    signalName: isRequest ? VK_JOIN_REQUEST_SIGNAL_NAME : VK_GROUP_MEMBER_JOINED_SIGNAL_NAME,
    chatKey: `g${groupId}`,
    userId,
    payload: { groupId, userId, joinType, self: false },
  };
};

/**
 * A conversation service message -> the trigger and payload. `userId` is `action.member_id`; "who invited / removed"
 * is the message's `from_id` (the action itself carries no such field — an assumption the VK docs do not spell out).
 * A negative `member_id` is an e-mail invite or a community, not a user: `undefined`.
 */
export const mapChatMemberEvent = (message: TVkRawActionMessage): IVkMemberEvent | undefined => {
  const type = message.action?.type;
  const userId = message.action?.member_id;
  if (!type || !userId || userId < 0) return;
  const joined = CHAT_INVITE_TYPES.has(type);
  if (!joined && type !== 'chat_kick_user') return;
  return {
    triggerName: joined ? VK_CHAT_MEMBER_JOINED_TRIGGER_NAME : VK_CHAT_MEMBER_LEFT_TRIGGER_NAME,
    signalName: joined ? VK_CHAT_MEMBER_JOINED_SIGNAL_NAME : VK_CHAT_MEMBER_LEFT_SIGNAL_NAME,
    chatKey: String(message.peer_id),
    userId,
    payload: {
      chat: { id: message.peer_id, type: vkChatTypeOf(message.peer_id) },
      userId,
      byId: message.from_id ?? 0,
      viaLink: type === 'chat_invite_user_by_link',
      date: message.date ?? 0,
    },
  };
};

const eventKeyOf = (update: IVkMemberUpdate, message?: TVkRawActionMessage): string => {
  const raw = update.event_id;
  if ((typeof raw === 'string' && raw !== '') || typeof raw === 'number') return String(raw);
  // A VK event always has an id; a stand-in that is at least stable for the same message keeps a redelivery deduped.
  return String(message?.conversation_message_id ?? message?.date ?? Date.now());
};

/** Signals every bound trigger of the event's kind (one execution per trigger document and event). */
const signalMemberEvent = async (
  ctx: IIntegrationBackendContext,
  event: IVkMemberEvent,
  eventKey: string,
): Promise<void> => {
  const bound = await findBoundTriggerFunctions(ctx);
  const documents = bound.filter((doc) => getTriggerFunctionBodyData(doc)?.triggerName === event.triggerName);
  if (documents.length === 0) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(event.chatKey),
      level: 'info',
      message: `Ignored a member event: no "${event.triggerName}" trigger function is bound to this community`,
      data: { errorType: 'NoBoundTrigger', signal: event.signalName, payload: event.payload },
    });
    return;
  }
  for (const doc of documents) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of documents at most, signalled in order.
    await ctx.signalWorkflow({
      workflowId: buildMemberEventWorkflowId({
        vendorPrefix: 'vk',
        documentId: doc.id,
        chatId: event.chatKey,
        userId: event.userId,
        eventKey,
      }),
      workflowType: doc.name,
      signalName: event.signalName,
      signalArgs: [event.payload],
    });
  }
};

/**
 * `group_join` / `group_leave`. The test-bot host (ADR 0073 (private)) never offers these (and the shared bot is not
 * an admin of a customer's community), so in sandbox mode they are dropped without a trace.
 */
export const handleGroupMemberUpdate = async (
  ctx: IIntegrationBackendContext,
  update: IVkMemberUpdate,
  fallbackGroupId?: number,
): Promise<void> => {
  if (ctx.sharedIngress) return;
  const groupId = update.group_id ?? fallbackGroupId;
  if (!groupId) return;
  const event = mapGroupMemberEvent(update, groupId);
  if (!event) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(`g${groupId}`),
      level: 'info',
      message: 'Ignored a community member event without a user',
      data: { errorType: 'NoUser', type: update.type },
    });
    return;
  }
  await signalMemberEvent(ctx, event, eventKeyOf(update));
};

/** A conversation's join/leave service message. Unusable `member_id` (an e-mail, a community) is journaled and skipped. */
export const handleChatMemberAction = async (
  ctx: IIntegrationBackendContext,
  update: IVkMemberUpdate,
  message: TVkRawActionMessage,
): Promise<void> => {
  if (ctx.sharedIngress) return;
  const event = mapChatMemberEvent(message);
  if (!event) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(message.peer_id),
      level: 'info',
      message: 'Ignored a conversation member event: the member is not a user (e-mail invite or a community)',
      data: { errorType: 'NoUser', action: message.action },
    });
    return;
  }
  await signalMemberEvent(ctx, event, eventKeyOf(update, message));
};
