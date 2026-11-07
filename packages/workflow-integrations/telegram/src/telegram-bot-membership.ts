import type { IIntegrationBackendContext } from '@falang/workflow-integrations-common';
import type { ITelegramRawChat, ITelegramRawUser } from './telegram-message-mapper.js';

const ABSENT_STATUSES: ReadonlySet<string> = new Set(['left', 'kicked']);

export interface ITelegramRawBotMember {
  readonly status: string;
  readonly user: ITelegramRawUser;
}

export interface ITelegramRawMyChatMemberUpdated {
  readonly chat: ITelegramRawChat;
  readonly from: ITelegramRawUser;
  readonly date: number;
  readonly old_chat_member: ITelegramRawBotMember;
  readonly new_chat_member: ITelegramRawBotMember;
}

const describeChange = (where: string, oldStatus: string, newStatus: string): string => {
  if (ABSENT_STATUSES.has(newStatus)) return `The bot was removed from ${where}`;
  if (ABSENT_STATUSES.has(oldStatus)) return `The bot was added to ${where} as ${newStatus}`;
  return `The bot's status in ${where} changed: ${oldStatus} -> ${newStatus}`;
};

/** `my_chat_member` is not a trigger in v1: it only leaves an `info` line in the journal of `tg-unbound-<chatId>`. */
export const reportBotMembershipChange = async (
  ctx: IIntegrationBackendContext,
  update: ITelegramRawMyChatMemberUpdated,
): Promise<void> => {
  const oldStatus = update.old_chat_member.status;
  const newStatus = update.new_chat_member.status;
  const where = update.chat.title ? `chat "${update.chat.title}" (${update.chat.id})` : `chat ${update.chat.id}`;
  const message = describeChange(where, oldStatus, newStatus);
  await ctx.reportJournalProblem?.({
    workflowId: `tg-unbound-${update.chat.id}`,
    level: 'info',
    message,
    data: { errorType: 'BotMembershipChanged', oldStatus, newStatus, chatType: update.chat.type },
  });
};
