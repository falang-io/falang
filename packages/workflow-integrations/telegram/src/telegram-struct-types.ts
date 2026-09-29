import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import { FILE_TYPE_ID } from '@falang/workflow-integrations-files';
import { TELEGRAM_CHAT_TYPE_ID, TELEGRAM_MESSAGE_TYPE_ID, TELEGRAM_USER_TYPE_ID } from './constants.js';

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
      chat: { type: 'struct', id: TELEGRAM_CHAT_TYPE_ID },
      from: { type: 'struct', id: TELEGRAM_USER_TYPE_ID, optional: true },
      photo: optionalFileType,
      document: optionalFileType,
      voice: optionalFileType,
      audio: optionalFileType,
      video: optionalFileType,
    },
  },
];
