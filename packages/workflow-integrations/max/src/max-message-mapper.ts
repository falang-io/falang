/**
 * Max Bot API's own snake_case wire shapes (`https://dev.max.ru/docs-api`) — only the subset the gateway
 * ingress reads. Attachments are kept loose (`type` + `payload`): `max-media.ts` picks the media kinds it
 * turns into `files/File`s and ignores the rest (stickers, contacts, locations, keyboards, link previews).
 */
export interface IMaxRawUser {
  readonly user_id: number;
  readonly first_name: string;
  readonly last_name?: string | null;
  readonly username?: string | null;
  readonly is_bot: boolean;
}

export interface IMaxRawMediaPayload {
  readonly url?: string;
  readonly token?: string;
}

export interface IMaxRawAttachment {
  readonly type: string;
  readonly payload?: IMaxRawMediaPayload | null;
  /** `file` attachments only. */
  readonly filename?: string;
  /** `file` attachments only, bytes. */
  readonly size?: number;
}

export interface IMaxRawMessage {
  readonly sender?: IMaxRawUser | null;
  readonly recipient: {
    readonly chat_id: number | null;
    readonly chat_type: string;
    readonly user_id?: number | null;
  };
  /** Unix time, milliseconds. */
  readonly timestamp: number;
  readonly body?: {
    readonly mid: string;
    readonly seq?: number;
    readonly text?: string | null;
    readonly attachments?: readonly IMaxRawAttachment[] | null;
  } | null;
}

export interface IMaxUser {
  readonly id: number;
  readonly isBot: boolean;
  readonly firstName: string;
  readonly lastName?: string;
  readonly username?: string;
}

/**
 * The camelCase shape `max/Message` is declared with (see `max-struct-types.ts`) and what a compiled
 * workflow reads. Media fields are attached separately by `max-media.ts`'s `resolveIncomingMedia`.
 */
export interface IMaxMessage {
  readonly messageId: string;
  readonly timestamp: number;
  readonly text?: string;
  readonly chat: { readonly id: number; readonly type: string };
  readonly from?: IMaxUser;
}

export const toMaxUser = (raw: IMaxRawUser | null | undefined): IMaxUser | undefined => {
  if (!raw) return;
  return {
    id: raw.user_id,
    isBot: raw.is_bot,
    firstName: raw.first_name,
    ...(raw.last_name ? { lastName: raw.last_name } : {}),
    ...(raw.username ? { username: raw.username } : {}),
  };
};

/** The chat a message belongs to — `recipient.chat_id` is set for dialogs, groups and channels alike; `0` when Max sent none. */
export const maxChatIdOf = (raw: IMaxRawMessage): number => raw.recipient.chat_id ?? 0;

/** snake_case Max `Message` -> camelCase `max/Message`. */
export const toMaxMessage = (raw: IMaxRawMessage): IMaxMessage => ({
  messageId: raw.body?.mid ?? '',
  timestamp: raw.timestamp,
  ...(raw.body?.text ? { text: raw.body.text } : {}),
  chat: { id: maxChatIdOf(raw), type: raw.recipient.chat_type },
  from: toMaxUser(raw.sender),
});

/**
 * Max has no `/start` message: pressing "Начать" in a new dialog (or opening a `https://max.ru/<bot>?start=<payload>`
 * deep link) arrives as a separate `bot_started` update. It is delivered to the workflow as if the user had sent
 * `/start` (`/start <payload>` for a deep link — the same text Telegram sends), so an on-command trigger for `start`
 * works the same in both messengers.
 */
export const botStartedToMaxMessage = (params: {
  readonly chatId: number;
  readonly user: IMaxRawUser;
  readonly timestamp: number;
  readonly payload?: string | null;
}): IMaxMessage => ({
  messageId: '',
  timestamp: params.timestamp,
  text: params.payload ? `/start ${params.payload}` : '/start',
  chat: { id: params.chatId, type: 'dialog' },
  from: toMaxUser(params.user),
});
