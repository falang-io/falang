import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import { FILE_TYPE_ID } from '@falang/workflow-integrations-files';
import {
  MAX_CHAT_TYPE_ID,
  MAX_MEMBER_EVENT_CHAT_TYPE_ID,
  MAX_MEMBER_EVENT_TYPE_ID,
  MAX_MESSAGE_TYPE_ID,
  MAX_USER_TYPE_ID,
} from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** A `files/File`, optional — `message.photo`/`.document`/`.audio`/`.video` (same shape as Telegram's, ADR 0038 (private) §5). */
const optionalFileType: TVariableInfo = { type: 'struct', id: FILE_TYPE_ID, optional: true };

/**
 * A practical subset of Max Bot API's `User`/`Message` objects, flattened into the same camelCase shape
 * `telegram/Message` uses (`chat.id`, `from.firstName`, `text`, media as `File`s) so a bot reads the
 * same way in both messengers. `messageId` is Max's `body.mid` (a string, unlike Telegram's number) and
 * `timestamp` is Unix time in **milliseconds**, as Max sends it. See `max-message-mapper.ts`.
 */
export const maxStructTypes: readonly IIntegrationStructType[] = [
  {
    id: MAX_USER_TYPE_ID,
    name: 'MaxUser',
    properties: {
      id: anyNumber,
      isBot: { type: 'boolean' },
      firstName: { type: 'string' },
      lastName: { type: 'string', optional: true },
      username: { type: 'string', optional: true },
    },
  },
  {
    id: MAX_CHAT_TYPE_ID,
    name: 'MaxChat',
    properties: {
      id: anyNumber,
      /** `dialog` (one-to-one with the bot), `chat` (a group) or `channel`. */
      type: { type: 'string' },
    },
  },
  {
    id: MAX_MESSAGE_TYPE_ID,
    name: 'MaxMessage',
    properties: {
      messageId: { type: 'string' },
      timestamp: anyNumber,
      text: { type: 'string', optional: true },
      chat: { type: 'struct', id: MAX_CHAT_TYPE_ID },
      from: { type: 'struct', id: MAX_USER_TYPE_ID, optional: true },
      photo: optionalFileType,
      document: optionalFileType,
      audio: optionalFileType,
      video: optionalFileType,
    },
  },
  {
    id: MAX_MEMBER_EVENT_CHAT_TYPE_ID,
    name: 'MaxMemberEventChat',
    properties: {
      id: anyNumber,
      /** `true` for a channel, `false` for a group chat. */
      isChannel: { type: 'boolean' },
    },
  },
  {
    id: MAX_MEMBER_EVENT_TYPE_ID,
    name: 'MaxMemberEvent',
    properties: {
      chat: { type: 'struct', id: MAX_MEMBER_EVENT_CHAT_TYPE_ID },
      /** The member who joined (`user_added`) or left / was removed (`user_removed`). */
      user: { type: 'struct', id: MAX_USER_TYPE_ID },
      /** `user_added`: who invited them (absent when they joined by link). `user_removed`: the admin who removed them (absent when they left on their own). */
      byId: { ...anyNumber, optional: true },
      /** Unix time, milliseconds. */
      date: anyNumber,
    },
  },
];
