import { buildMemberEventWorkflowId } from '@falang/workflow-integrations-common';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import {
  TELEGRAM_JOIN_REQUEST_SIGNAL_NAME,
  TELEGRAM_JOIN_REQUEST_TRIGGER_NAME,
  TELEGRAM_MEMBER_JOINED_SIGNAL_NAME,
  TELEGRAM_MEMBER_JOINED_TRIGGER_NAME,
  TELEGRAM_MEMBER_LEFT_SIGNAL_NAME,
  TELEGRAM_MEMBER_LEFT_TRIGGER_NAME,
} from './constants.js';
import {
  toTelegramChat,
  toTelegramUser,
  type ITelegramChat,
  type ITelegramRawChat,
  type ITelegramRawMessage,
  type ITelegramRawUser,
  type ITelegramUser,
} from './telegram-message-mapper.js';

/** `ChatMember*` as far as ingress needs it: every variant carries `user` at its top level. */
export interface ITelegramRawChatMember {
  readonly status: string;
  readonly user: ITelegramRawUser;
  /** `ChatMemberRestricted` only. */
  readonly is_member?: boolean;
}

export interface ITelegramRawChatInviteLink {
  readonly invite_link: string;
}

export interface ITelegramRawChatMemberUpdated {
  readonly chat: ITelegramRawChat;
  readonly from: ITelegramRawUser;
  readonly date: number;
  readonly old_chat_member: ITelegramRawChatMember;
  readonly new_chat_member: ITelegramRawChatMember;
  readonly invite_link?: ITelegramRawChatInviteLink;
  readonly via_join_request?: boolean;
}

export interface ITelegramRawChatJoinRequest {
  readonly chat: ITelegramRawChat;
  readonly from: ITelegramRawUser;
  readonly user_chat_id: number;
  readonly date: number;
  readonly bio?: string;
  readonly invite_link?: ITelegramRawChatInviteLink;
}

/** `telegram/MemberEvent`. */
export interface ITelegramMemberEvent {
  readonly chat: ITelegramChat;
  readonly user: ITelegramUser;
  readonly by?: ITelegramUser;
  readonly date: number;
  readonly kicked: boolean;
  readonly inviteLink?: string;
  readonly viaJoinRequest: boolean;
}

/** `telegram/JoinRequest`. */
export interface ITelegramJoinRequest {
  readonly chat: ITelegramChat;
  readonly user: ITelegramUser;
  readonly userChatId: number;
  readonly date: number;
  readonly bio?: string;
  readonly inviteLink?: string;
}

export type TMemberEventKind = 'joined' | 'left';

export interface IClassifiedMemberEvent {
  readonly kind: TMemberEventKind;
  readonly chatId: number;
  readonly userId: number;
  readonly payload: ITelegramMemberEvent;
}

const PRESENT_STATUSES: ReadonlySet<string> = new Set(['member', 'administrator', 'creator']);
const ABSENT_STATUSES: ReadonlySet<string> = new Set(['left', 'kicked']);

/** A `restricted` member counts as present only with `is_member: true`. */
const isPresent = (member: ITelegramRawChatMember): boolean =>
  PRESENT_STATUSES.has(member.status) || (member.status === 'restricted' && member.is_member === true);

const toTelegramUserStrict = (raw: ITelegramRawUser): ITelegramUser => toTelegramUser(raw) as ITelegramUser;

/** `by` = who did it; absent from the payload when the user acted themselves (joined via a link / left on their own). */
const byField = (actor: ITelegramRawUser | undefined, user: ITelegramRawUser): { by?: ITelegramUser } =>
  actor && actor.id !== user.id ? { by: toTelegramUserStrict(actor) } : {};

const transitionKind = (
  oldMember: ITelegramRawChatMember,
  newMember: ITelegramRawChatMember,
): TMemberEventKind | null => {
  if (!isPresent(oldMember) && isPresent(newMember)) return 'joined';
  if (ABSENT_STATUSES.has(newMember.status) && !ABSENT_STATUSES.has(oldMember.status)) return 'left';
  return null;
};

/** A `chat_member` update -> a joined/left event, or `null` for a transition that is neither (promotion, restriction, …). */
export const classifyChatMemberUpdate = (update: ITelegramRawChatMemberUpdated): IClassifiedMemberEvent | null => {
  const oldMember = update.old_chat_member;
  const newMember = update.new_chat_member;
  const user = newMember.user;
  const kind = transitionKind(oldMember, newMember);
  if (!kind) return null;
  return {
    kind,
    chatId: update.chat.id,
    userId: user.id,
    payload: {
      chat: toTelegramChat(update.chat),
      user: toTelegramUserStrict(user),
      ...byField(update.from, user),
      date: update.date,
      kicked: kind === 'left' && newMember.status === 'kicked',
      ...(update.invite_link ? { inviteLink: update.invite_link.invite_link } : {}),
      viaJoinRequest: update.via_join_request === true,
    },
  };
};

/**
 * Service messages `new_chat_members` (one event per listed user) / `left_chat_member`. Telegram may stop sending
 * them for large groups, so they only complement `chat_member`; a left member removed by someone else counts as `kicked`.
 */
export const classifyServiceMessage = (message: ITelegramRawMessage): readonly IClassifiedMemberEvent[] => {
  const chat = toTelegramChat(message.chat);
  const build = (kind: TMemberEventKind, user: ITelegramRawUser): IClassifiedMemberEvent => {
    const byPart = byField(message.from, user);
    return {
      kind,
      chatId: message.chat.id,
      userId: user.id,
      payload: {
        chat,
        user: toTelegramUserStrict(user),
        ...byPart,
        date: message.date,
        kicked: kind === 'left' && 'by' in byPart,
        viaJoinRequest: false,
      },
    };
  };
  const events: IClassifiedMemberEvent[] = [];
  for (const user of message.new_chat_members ?? []) events.push(build('joined', user));
  if (message.left_chat_member) events.push(build('left', message.left_chat_member));
  return events;
};

export const isServiceMemberMessage = (message: ITelegramRawMessage): boolean =>
  (message.new_chat_members?.length ?? 0) > 0 || Boolean(message.left_chat_member);

export const toJoinRequest = (raw: ITelegramRawChatJoinRequest): ITelegramJoinRequest => ({
  chat: toTelegramChat(raw.chat),
  user: toTelegramUserStrict(raw.from),
  userChatId: raw.user_chat_id,
  date: raw.date,
  ...(typeof raw.bio === 'string' ? { bio: raw.bio } : {}),
  ...(raw.invite_link ? { inviteLink: raw.invite_link.invite_link } : {}),
});

/** An admin bot receives both `chat_member` and the service message for one change; the second is dropped within this window. */
export const MEMBER_EVENT_DEDUP_WINDOW_MS = 10_000;

/** In-memory `(chatId, userId, joined|left)` dedup, one per backend target. */
export class MemberEventDeduplicator {
  private readonly seen = new Map<string, number>();

  /** `true` when this event was already seen within the window (and so must be dropped). */
  isDuplicate(chatId: number, userId: number, kind: TMemberEventKind, now: number = Date.now()): boolean {
    for (const [key, at] of this.seen) {
      if (now - at > MEMBER_EVENT_DEDUP_WINDOW_MS) this.seen.delete(key);
    }
    const key = `${chatId}:${userId}:${kind}`;
    const previous = this.seen.get(key);
    if (typeof previous === 'number' && now - previous <= MEMBER_EVENT_DEDUP_WINDOW_MS) return true;
    this.seen.set(key, now);
    return false;
  }
}

const TRIGGER_BY_KIND = {
  joined: { triggerName: TELEGRAM_MEMBER_JOINED_TRIGGER_NAME, signalName: TELEGRAM_MEMBER_JOINED_SIGNAL_NAME },
  left: { triggerName: TELEGRAM_MEMBER_LEFT_TRIGGER_NAME, signalName: TELEGRAM_MEMBER_LEFT_SIGNAL_NAME },
} as const;

export type TTriggerNameOf = (doc: IIntegrationDocumentRecord) => string | undefined;

const unboundWorkflowId = (chatId: number): string => `tg-unbound-${chatId}`;

/** Signals one fresh execution into every bound document of `triggerName`; reports an `info` problem when there is none. */
const dispatch = async (params: {
  readonly ctx: IIntegrationBackendContext;
  readonly documents: readonly IIntegrationDocumentRecord[];
  readonly triggerNameOf: TTriggerNameOf;
  readonly triggerName: string;
  readonly signalName: string;
  readonly chatId: number;
  readonly userId: number;
  readonly updateId: number;
  readonly payload: unknown;
  readonly what: string;
}): Promise<void> => {
  const { ctx, documents, triggerName, signalName, chatId, userId, updateId, payload, what } = params;
  const targets = documents.filter((doc) => params.triggerNameOf(doc) === triggerName);
  if (targets.length === 0) {
    await ctx.reportJournalProblem?.({
      workflowId: unboundWorkflowId(chatId),
      level: 'info',
      message: `Ignored ${what}: no "${triggerName}" trigger function is bound to this bot`,
      data: { errorType: 'NoBoundTrigger', signal: signalName, payload },
    });
    return;
  }
  for (const doc of targets) {
    // oxlint-disable-next-line no-await-in-loop -- signalled in order, one at a time.
    await ctx.signalWorkflow({
      workflowId: buildMemberEventWorkflowId({
        vendorPrefix: 'tg',
        documentId: doc.id,
        chatId,
        userId,
        eventKey: updateId,
      }),
      workflowType: doc.name,
      signalName,
      signalArgs: [payload],
    });
  }
};

export interface IMemberEventContext {
  readonly ctx: IIntegrationBackendContext;
  readonly documents: readonly IIntegrationDocumentRecord[];
  readonly triggerNameOf: TTriggerNameOf;
  readonly dedup: MemberEventDeduplicator;
}

/** Delivers classified member events (after dedup) to their triggers. */
export const deliverMemberEvents = async (
  env: IMemberEventContext,
  updateId: number,
  events: readonly IClassifiedMemberEvent[],
): Promise<void> => {
  for (const event of events) {
    if (env.dedup.isDuplicate(event.chatId, event.userId, event.kind)) continue;
    const route = TRIGGER_BY_KIND[event.kind];
    // oxlint-disable-next-line no-await-in-loop -- in order.
    await dispatch({
      ...env,
      ...route,
      chatId: event.chatId,
      userId: event.userId,
      updateId,
      payload: event.payload,
      what: `a member ${event.kind} event`,
    });
  }
};

export const deliverJoinRequest = async (
  env: IMemberEventContext,
  updateId: number,
  raw: ITelegramRawChatJoinRequest,
): Promise<void> => {
  await dispatch({
    ...env,
    triggerName: TELEGRAM_JOIN_REQUEST_TRIGGER_NAME,
    signalName: TELEGRAM_JOIN_REQUEST_SIGNAL_NAME,
    chatId: raw.chat.id,
    userId: raw.from.id,
    updateId,
    payload: toJoinRequest(raw),
    what: 'a join request',
  });
};
