import type { TVariableInfo } from '@falang/typescript-dto';
import {
  buildChatTypeContextField,
  buildConversationContextField,
  type IFieldConfig,
  type ITriggerDescriptor,
} from '@falang/workflow-integrations-common';
import {
  TELEGRAM_EVENT_SCOPE_VARIABLE_NAME,
  TELEGRAM_JOIN_REQUEST_SIGNAL_NAME,
  TELEGRAM_JOIN_REQUEST_TRIGGER_NAME,
  TELEGRAM_JOIN_REQUEST_TYPE_ID,
  TELEGRAM_MEMBER_EVENT_TYPE_ID,
  TELEGRAM_MEMBER_JOINED_SIGNAL_NAME,
  TELEGRAM_MEMBER_JOINED_TRIGGER_NAME,
  TELEGRAM_MEMBER_LEFT_SIGNAL_NAME,
  TELEGRAM_MEMBER_LEFT_TRIGGER_NAME,
  TELEGRAM_REQUEST_SCOPE_VARIABLE_NAME,
} from './constants.js';

const WEBHOOK_PATH = '/webhooks/telegram/:projectId/:credentialId/:env';

/** The two routing fields every on-message trigger carries (ADR 0076 (private) §2). */
export const telegramRoutingContextFields = (): readonly IFieldConfig[] => [
  buildChatTypeContextField({
    label: 'telegram:field.chatType',
    any: 'telegram:chatType.any',
    private: 'telegram:chatType.private',
    group: 'telegram:chatType.group',
  }),
  buildConversationContextField({
    label: 'telegram:field.conversation',
    perChat: 'telegram:conversation.perChat',
    perUser: 'telegram:conversation.perUser',
    perEvent: 'telegram:conversation.perEvent',
  }),
];

/** Appended to the `notes` of both on-message triggers. */
export const TELEGRAM_ROUTING_NOTES = [
  'Two optional contextFields choose which chats it listens to and how executions are keyed.',
  'contextFields.chatType: "any" (default), "private" (one-to-one chats only) or "group" (groups, supergroups and',
  'channels only). Several on-message documents can coexist when their chatType filters differ (e.g. one for private',
  'chats, one for groups); the first whose filter admits the chat gets the message.',
  'contextFields.conversation: "per-chat" (default — one long-running execution per chat; in a group every member',
  'shares it), "per-user" (one execution per user in the chat — a separate dialog with each group member) or',
  '"per-event" (a fresh, stateless execution per message — use it for moderation). For group moderation (delete spam,',
  'ban on a link) set chatType "group" AND conversation "per-event"; the bot must be an admin of the group (or have',
  'privacy mode off, otherwise it sees only commands and replies). Until pending-question routing exists, the',
  'buttons of a telegram-question asked in a group are not routed to the run that asked when conversation is',
  '"per-user" or "per-event" — keep question flows in private chats or in "per-chat" mode.',
].join(' ');

const memberScope = (typeId: string): TVariableInfo => ({ type: 'struct', id: typeId });

const MEMBER_NOTES_COMMON = [
  'The bot must be an ADMINISTRATOR of the group/channel for Telegram to deliver chat_member updates (the platform',
  'asks for them explicitly); a non-admin bot still gets the join/leave service messages in small groups. Every event is',
  'its own execution (one per event) — there is no conversation to continue. The platform test bot (sandbox mode)',
  'never receives these events: use a dedicated bot token of the project.',
].join(' ');

export const telegramCommunityTriggers: readonly ITriggerDescriptor[] = [
  {
    name: TELEGRAM_MEMBER_JOINED_TRIGGER_NAME,
    label: 'telegram:trigger.memberJoined',
    scopeType: memberScope(TELEGRAM_MEMBER_EVENT_TYPE_ID),
    scopeVariableName: TELEGRAM_EVENT_SCOPE_VARIABLE_NAME,
    signalName: TELEGRAM_MEMBER_JOINED_SIGNAL_NAME,
    webhookPath: WEBHOOK_PATH,
    journalMessage: '${event.user.firstName} joined',
    notes: [
      'Fires once for each user who joins a group, supergroup or channel the bot is in (greet newcomers, start an',
      'onboarding or a captcha, record the member). `event` has chat, user, by (who added them; absent when they',
      'joined by a link), date, inviteLink and viaJoinRequest. Use this instead of reading service messages in the',
      'on-message trigger. To react to what members WRITE, use the on-message trigger with chatType "group".',
      MEMBER_NOTES_COMMON,
    ].join(' '),
  },
  {
    name: TELEGRAM_MEMBER_LEFT_TRIGGER_NAME,
    label: 'telegram:trigger.memberLeft',
    scopeType: memberScope(TELEGRAM_MEMBER_EVENT_TYPE_ID),
    scopeVariableName: TELEGRAM_EVENT_SCOPE_VARIABLE_NAME,
    signalName: TELEGRAM_MEMBER_LEFT_SIGNAL_NAME,
    webhookPath: WEBHOOK_PATH,
    journalMessage: '${event.user.firstName} left',
    notes: [
      'Fires once for each user who leaves OR is removed from a group, supergroup or channel the bot is in.',
      '`event.kicked` is true when they were banned/removed (then `event.by` says by whom), false when they left on',
      'their own. Same payload as the member-joined trigger.',
      MEMBER_NOTES_COMMON,
    ].join(' '),
  },
  {
    name: TELEGRAM_JOIN_REQUEST_TRIGGER_NAME,
    label: 'telegram:trigger.joinRequest',
    scopeType: memberScope(TELEGRAM_JOIN_REQUEST_TYPE_ID),
    scopeVariableName: TELEGRAM_REQUEST_SCOPE_VARIABLE_NAME,
    signalName: TELEGRAM_JOIN_REQUEST_SIGNAL_NAME,
    webhookPath: WEBHOOK_PATH,
    journalMessage: '${request.user.firstName} asked to join',
    notes: [
      'Fires when a user asks to join a group or channel that requires admin approval (invite links with "request',
      'admin approval"). `request` has chat, user, userChatId (the private chat id the bot may write to for about five',
      'minutes while the request is pending), date, bio and inviteLink. Answer it with the approve / decline join request',
      'actions (the bot needs the can_invite_users right). One execution per request.',
      MEMBER_NOTES_COMMON,
    ].join(' '),
  },
];
