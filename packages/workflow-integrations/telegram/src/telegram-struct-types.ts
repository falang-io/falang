import type { TVariableInfo } from '@falang/typescript-dto';
import { buildMessageSendResultStructType, type IIntegrationStructType } from '@falang/workflow-integrations-common';
import { FILE_TYPE_ID } from '@falang/workflow-integrations-files';
import {
  TELEGRAM_CHAT_TYPE_ID,
  TELEGRAM_JOIN_REQUEST_TYPE_ID,
  TELEGRAM_MEMBER_EVENT_TYPE_ID,
  TELEGRAM_MEMBER_INFO_TYPE_ID,
  TELEGRAM_MESSAGE_ENTITY_TYPE_ID,
  TELEGRAM_MESSAGE_TYPE_ID,
  TELEGRAM_USER_TYPE_ID,
  TELEGRAM_SEND_RESULT_TYPE_ID,
} from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** A `files/File`, optional — `message.photo`/`.document`/`.voice`/`.audio`/`.video` (ADR 0038 (private) §5). */
const optionalFileType: TVariableInfo = { type: 'struct', id: FILE_TYPE_ID, optional: true };

/**
 * A practical subset of Telegram Bot API's `User`/`Chat`/`Message` objects — enough for the common
 * "read the text, reply to the chat" bot flow, not a full mirror of Telegram's schema. Registered
 * into the editor's `TypesRegistryStore` via `IWorkflowIntegration.types` (see
 * `@falang/workflow-scheme`'s `IntegrationsModule`), the same way a user-authored `objects-structure`
 * struct is, so `telegram-trigger`'s `scopeType` can reference them by id like any other struct.
 */
export const telegramStructTypes: readonly IIntegrationStructType[] = [
  {
    id: TELEGRAM_USER_TYPE_ID,
    name: 'TelegramUser',
    properties: {
      id: anyNumber,
      isBot: { type: 'boolean' },
      firstName: { type: 'string' },
      username: { type: 'string', optional: true },
    },
  },
  {
    id: TELEGRAM_CHAT_TYPE_ID,
    name: 'TelegramChat',
    properties: {
      id: anyNumber,
      type: { type: 'string' },
      title: { type: 'string', optional: true },
    },
  },
  {
    id: TELEGRAM_MESSAGE_ENTITY_TYPE_ID,
    name: 'TelegramMessageEntity',
    properties: {
      type: { type: 'string' },
      offset: anyNumber,
      length: anyNumber,
      url: { type: 'string', optional: true },
    },
  },
  {
    id: TELEGRAM_MESSAGE_TYPE_ID,
    name: 'TelegramMessage',
    properties: {
      messageId: anyNumber,
      date: anyNumber,
      text: { type: 'string', optional: true },
      caption: { type: 'string', optional: true },
      entities: {
        type: 'array',
        elementType: { type: 'struct', id: TELEGRAM_MESSAGE_ENTITY_TYPE_ID },
        dimensions: 1,
        optional: true,
      },
      chat: { type: 'struct', id: TELEGRAM_CHAT_TYPE_ID },
      from: { type: 'struct', id: TELEGRAM_USER_TYPE_ID, optional: true },
      photo: optionalFileType,
      document: optionalFileType,
      voice: optionalFileType,
      audio: optionalFileType,
      video: optionalFileType,
    },
  },
  {
    id: TELEGRAM_MEMBER_EVENT_TYPE_ID,
    name: 'TelegramMemberEvent',
    properties: {
      chat: { type: 'struct', id: TELEGRAM_CHAT_TYPE_ID },
      user: { type: 'struct', id: TELEGRAM_USER_TYPE_ID },
      by: { type: 'struct', id: TELEGRAM_USER_TYPE_ID, optional: true },
      date: anyNumber,
      kicked: { type: 'boolean' },
      inviteLink: { type: 'string', optional: true },
      viaJoinRequest: { type: 'boolean' },
    },
  },
  {
    id: TELEGRAM_JOIN_REQUEST_TYPE_ID,
    name: 'TelegramJoinRequest',
    properties: {
      chat: { type: 'struct', id: TELEGRAM_CHAT_TYPE_ID },
      user: { type: 'struct', id: TELEGRAM_USER_TYPE_ID },
      userChatId: anyNumber,
      date: anyNumber,
      bio: { type: 'string', optional: true },
      inviteLink: { type: 'string', optional: true },
    },
  },
  {
    id: TELEGRAM_MEMBER_INFO_TYPE_ID,
    name: 'TelegramMemberInfo',
    properties: {
      status: { type: 'string' },
      user: { type: 'struct', id: TELEGRAM_USER_TYPE_ID },
      isAdmin: { type: 'boolean' },
    },
  },
  // What the send actions return (`telegram-send-message`/`-send-buttons`/`-send-file`, see `telegram-send-result.ts`).
  buildMessageSendResultStructType(TELEGRAM_SEND_RESULT_TYPE_ID, 'TelegramSendResult'),
];
