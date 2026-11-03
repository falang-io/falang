import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import { FILE_TYPE_ID } from '@falang/workflow-integrations-files';
import { VK_CHAT_TYPE_ID, VK_MESSAGE_TYPE_ID, VK_USER_TYPE_ID } from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** A `files/File`, optional — `message.photo`/`.document`/`.voice` (same idea as Telegram's/MAX's media fields). */
const optionalFileType: TVariableInfo = { type: 'struct', id: FILE_TYPE_ID, optional: true };

/**
 * A practical subset of VK's `message` object in the same camelCase shape the other messengers use (`chat.id`,
 * `from.firstName`, `text`, media as `File`s). `chat.id` is VK's `peer_id` — the id to reply to. See `vk-message-mapper.ts`.
 */
export const vkStructTypes: readonly IIntegrationStructType[] = [
  {
    id: VK_USER_TYPE_ID,
    name: 'VkUser',
    properties: {
      id: anyNumber,
      firstName: { type: 'string', optional: true },
      lastName: { type: 'string', optional: true },
    },
  },
  {
    id: VK_CHAT_TYPE_ID,
    name: 'VkChat',
    properties: {
      /** VK `peer_id`: a user's id for a private dialog, 2000000000 + chat id for a conversation, minus the community id for a community. */
      id: anyNumber,
      /** `private`, `chat` (a conversation) or `group`. */
      type: { type: 'string' },
    },
  },
  {
    id: VK_MESSAGE_TYPE_ID,
    name: 'VkMessage',
    properties: {
      messageId: anyNumber,
      conversationMessageId: anyNumber,
      text: { type: 'string' },
      /** Unix time, seconds. */
      date: anyNumber,
      chat: { type: 'struct', id: VK_CHAT_TYPE_ID },
      from: { type: 'struct', id: VK_USER_TYPE_ID, optional: true },
      /** The `ref` of a `vk.me/<community>?ref=…` deep link, when present. */
      ref: { type: 'string', optional: true },
      /** The parsed button payload (an object), when the message came from a button. */
      payload: { type: 'any', optional: true },
      photo: optionalFileType,
      document: optionalFileType,
      voice: optionalFileType,
    },
  },
];
