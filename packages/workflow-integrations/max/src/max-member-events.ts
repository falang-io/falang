import { buildMemberEventWorkflowId } from '@falang/workflow-integrations-common';
import type { IIntegrationBackendContext } from '@falang/workflow-integrations-common';
import {
  MAX_MEMBER_JOINED_SIGNAL_NAME,
  MAX_MEMBER_JOINED_TRIGGER_NAME,
  MAX_MEMBER_LEFT_SIGNAL_NAME,
  MAX_MEMBER_LEFT_TRIGGER_NAME,
} from './constants.js';
import { toMaxUser, type IMaxRawUser, type IMaxUser } from './max-message-mapper.js';
import {
  findBoundTriggerFunctions,
  getTriggerFunctionBodyData,
  maxUnboundWorkflowId,
} from './max-trigger-documents.js';

export interface IMaxUserAddedUpdate {
  readonly update_type: 'user_added';
  readonly timestamp: number;
  readonly chat_id: number;
  readonly user: IMaxRawUser;
  /** `null`/absent when the user joined by a link. */
  readonly inviter_id?: number | null;
  readonly is_channel?: boolean;
}

export interface IMaxUserRemovedUpdate {
  readonly update_type: 'user_removed';
  readonly timestamp: number;
  readonly chat_id: number;
  readonly user: IMaxRawUser;
  /** `null`/absent when the user left on their own. */
  readonly admin_id?: number | null;
  readonly is_channel?: boolean;
}

export interface IMaxBotChatUpdate {
  readonly update_type: 'bot_added' | 'bot_removed';
  readonly timestamp: number;
  readonly chat_id: number;
  readonly user?: IMaxRawUser;
  readonly is_channel?: boolean;
}

/** The camelCase `max/MemberEvent` payload. */
export interface IMaxMemberEvent {
  readonly chat: { readonly id: number; readonly isChannel: boolean };
  readonly user: IMaxUser;
  readonly byId?: number;
  readonly date: number;
}

export const MAX_MEMBER_UPDATE_TYPES: readonly string[] = ['user_added', 'user_removed', 'bot_added', 'bot_removed'];

export const toMaxMemberEvent = (update: IMaxUserAddedUpdate | IMaxUserRemovedUpdate): IMaxMemberEvent => {
  const byId = update.update_type === 'user_added' ? update.inviter_id : update.admin_id;
  return {
    chat: { id: update.chat_id, isChannel: update.is_channel === true },
    // `user` is required by the schema; the fallback only keeps a malformed update from throwing.
    user: toMaxUser(update.user) ?? { id: 0, isBot: false, firstName: '' },
    ...(typeof byId === 'number' ? { byId } : {}),
    date: update.timestamp,
  };
};

/** `user_added` / `user_removed`: one fresh execution per bound member trigger (`per-event`, id ends with the timestamp). */
export const signalMaxMemberEvent = async (
  ctx: IIntegrationBackendContext,
  update: IMaxUserAddedUpdate | IMaxUserRemovedUpdate,
): Promise<void> => {
  const joined = update.update_type === 'user_added';
  const triggerName = joined ? MAX_MEMBER_JOINED_TRIGGER_NAME : MAX_MEMBER_LEFT_TRIGGER_NAME;
  const signalName = joined ? MAX_MEMBER_JOINED_SIGNAL_NAME : MAX_MEMBER_LEFT_SIGNAL_NAME;
  const chatId = update.chat_id;
  if (!chatId || !update.user) return;

  const documents = await findBoundTriggerFunctions(ctx);
  const bound = documents.filter((doc) => getTriggerFunctionBodyData(doc)?.triggerName === triggerName);
  const event = toMaxMemberEvent(update);
  if (bound.length === 0) {
    await ctx.reportJournalProblem?.({
      workflowId: maxUnboundWorkflowId(chatId),
      level: 'info',
      message: `Ignored a ${update.update_type} event: no ${triggerName} trigger function is bound to this bot`,
      data: { errorType: 'NoBoundTrigger', signal: signalName, payload: event },
    });
    return;
  }
  for (const doc of bound) {
    // oxlint-disable-next-line no-await-in-loop -- a couple of documents at most; sequential keeps the order.
    await ctx.signalWorkflow({
      workflowId: buildMemberEventWorkflowId({
        vendorPrefix: 'max',
        documentId: doc.id,
        chatId,
        userId: event.user.id,
        eventKey: update.timestamp,
      }),
      workflowType: doc.name,
      signalName,
      signalArgs: [event],
    });
  }
};

/** `bot_added` / `bot_removed`: no workflow reacts to them — just a journal line so the owner can see the bot was (re)moved. */
export const reportMaxBotChatEvent = async (
  ctx: IIntegrationBackendContext,
  update: IMaxBotChatUpdate,
): Promise<void> => {
  await ctx.reportJournalProblem?.({
    workflowId: maxUnboundWorkflowId(update.chat_id),
    level: 'info',
    message: update.update_type === 'bot_added' ? 'The bot was added to a chat' : 'The bot was removed from a chat',
    data: {
      errorType: update.update_type === 'bot_added' ? 'BotAddedToChat' : 'BotRemovedFromChat',
      chatId: update.chat_id,
      byUserId: update.user?.user_id,
      isChannel: update.is_channel === true,
    },
  });
};
