import type { TVariableInfo } from '@falang/typescript-dto';
import type { ITriggerDescriptor } from '@falang/workflow-integrations-common';
import {
  VK_CHAT_MEMBER_EVENT_TYPE_ID,
  VK_CHAT_MEMBER_JOINED_SIGNAL_NAME,
  VK_CHAT_MEMBER_JOINED_TRIGGER_NAME,
  VK_CHAT_MEMBER_LEFT_SIGNAL_NAME,
  VK_CHAT_MEMBER_LEFT_TRIGGER_NAME,
  VK_EVENT_SCOPE_VARIABLE_NAME,
  VK_GROUP_MEMBER_EVENT_TYPE_ID,
  VK_GROUP_MEMBER_JOINED_SIGNAL_NAME,
  VK_GROUP_MEMBER_JOINED_TRIGGER_NAME,
  VK_GROUP_MEMBER_LEFT_SIGNAL_NAME,
  VK_GROUP_MEMBER_LEFT_TRIGGER_NAME,
  VK_JOIN_REQUEST_SIGNAL_NAME,
  VK_JOIN_REQUEST_TRIGGER_NAME,
  VK_REQUEST_SCOPE_VARIABLE_NAME,
} from './constants.js';

const VK_WEBHOOK_PATH = '/webhooks/vk/:projectId/:credentialId/:env';

const groupEventType: TVariableInfo = { type: 'struct', id: VK_GROUP_MEMBER_EVENT_TYPE_ID };
const chatEventType: TVariableInfo = { type: 'struct', id: VK_CHAT_MEMBER_EVENT_TYPE_ID };

const NO_TEST_BOT =
  'The platform test bot (the "Test bot" switch of the dev stand) never delivers this event: it is not an administrator of your community. Test it on the dev stand with the project\'s own community key.';

/**
 * The member-event triggers (ADR 0076 (private) §1). Every one is "per event": a fresh execution per event,
 * workflow id `vk-<doc>-<g<groupId>|peer_id>-<userId>-<event_id>`. VK has two membership levels, hence two pairs:
 * the community's subscribers (`group_join` / `group_leave`) and a conversation's members (service messages).
 */
export const vkMemberTriggers: readonly ITriggerDescriptor[] = [
  {
    name: VK_GROUP_MEMBER_JOINED_TRIGGER_NAME,
    label: 'vk:trigger.groupMemberJoined',
    scopeType: groupEventType,
    scopeVariableName: VK_EVENT_SCOPE_VARIABLE_NAME,
    signalName: VK_GROUP_MEMBER_JOINED_SIGNAL_NAME,
    webhookPath: VK_WEBHOOK_PATH,
    journalMessage: 'Joined the community: ${event.userId}',
    notes: [
      'Fires when someone becomes a SUBSCRIBER of the VK community (`group_join` — join, unsure, accepted, approved;',
      'a join request to a closed community goes to the "vk-join-request" trigger instead). Use it to greet or log new',
      'subscribers; to write to them, send to `event.userId` (it works only after they allowed messages from the',
      'community). `event.joinType` says how they joined; `event.self` is always false. A new member of a CONVERSATION',
      'is a different event — use "vk-chat-member-joined". One execution per event. The community must be allowed to',
      `see these events (the bot switches them on itself). ${NO_TEST_BOT}`,
    ].join(' '),
  },
  {
    name: VK_GROUP_MEMBER_LEFT_TRIGGER_NAME,
    label: 'vk:trigger.groupMemberLeft',
    scopeType: groupEventType,
    scopeVariableName: VK_EVENT_SCOPE_VARIABLE_NAME,
    signalName: VK_GROUP_MEMBER_LEFT_SIGNAL_NAME,
    webhookPath: VK_WEBHOOK_PATH,
    journalMessage: 'Left the community: ${event.userId}',
    notes: [
      'Fires when a SUBSCRIBER leaves the VK community or is removed from it (`group_leave`). `event.self` is true when',
      'the user left on their own and false when the community removed them; `event.joinType` is absent. A member leaving',
      `a CONVERSATION is a different event — use "vk-chat-member-left". One execution per event. ${NO_TEST_BOT}`,
    ].join(' '),
  },
  {
    name: VK_JOIN_REQUEST_TRIGGER_NAME,
    label: 'vk:trigger.joinRequest',
    scopeType: groupEventType,
    scopeVariableName: VK_REQUEST_SCOPE_VARIABLE_NAME,
    signalName: VK_JOIN_REQUEST_SIGNAL_NAME,
    webhookPath: VK_WEBHOOK_PATH,
    journalMessage: 'Join request: ${request.userId}',
    notes: [
      'Fires when someone applies to join a CLOSED VK community (`group_join` with join_type "request"). NOTIFICATION',
      "ONLY: with a community key VK has no way to approve or decline the request — it is handled in VK's own UI",
      '(the community\'s "Requests" list). Use it to tell the owner or to keep a record; do not promise the user an',
      `automatic approval. The payload is the same shape as "vk-group-member-joined". ${NO_TEST_BOT}`,
    ].join(' '),
  },
  {
    name: VK_CHAT_MEMBER_JOINED_TRIGGER_NAME,
    label: 'vk:trigger.chatMemberJoined',
    scopeType: chatEventType,
    scopeVariableName: VK_EVENT_SCOPE_VARIABLE_NAME,
    signalName: VK_CHAT_MEMBER_JOINED_SIGNAL_NAME,
    webhookPath: VK_WEBHOOK_PATH,
    journalMessage: 'Joined the conversation: ${event.userId}',
    notes: [
      'Fires when a user is added to (or joins by link) a CONVERSATION (group chat) the community is in — the service',
      'message "invited a user". The community must be an administrator of the conversation. The message is consumed by',
      'this trigger and never reaches the on-message trigger. `event.chat.id` is the conversation peer_id (reply there),',
      '`event.userId` the new member, `event.byId` who added them (the service message sender; the same as `userId` when',
      'they joined by link), `event.viaLink` tells a link join. E-mail invites and community members are skipped.',
      'To react to ordinary messages of a conversation use the on-message trigger with chatType "group" instead.',
      `One execution per event. ${NO_TEST_BOT}`,
    ].join(' '),
  },
  {
    name: VK_CHAT_MEMBER_LEFT_TRIGGER_NAME,
    label: 'vk:trigger.chatMemberLeft',
    scopeType: chatEventType,
    scopeVariableName: VK_EVENT_SCOPE_VARIABLE_NAME,
    signalName: VK_CHAT_MEMBER_LEFT_SIGNAL_NAME,
    webhookPath: VK_WEBHOOK_PATH,
    journalMessage: 'Left the conversation: ${event.userId}',
    notes: [
      'Fires when a user leaves or is removed from a CONVERSATION (group chat) the community is in — the service',
      'message "removed a user". `event.userId` is the member, `event.byId` who acted: equal to `userId` when the user',
      'left on their own, otherwise the administrator who removed them. `event.viaLink` is false. The message is',
      `consumed by this trigger and never reaches the on-message trigger. One execution per event. ${NO_TEST_BOT}`,
    ].join(' '),
  },
];
