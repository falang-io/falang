/**
 * Telegram Bot API's own snake_case wire shapes (`Message`'s media sub-objects) — only the subset
 * `telegram-media.ts`'s `resolveIncomingMedia` needs to turn a reference into a `files/File`. See
 * ADR 0038 (private) §5.
 */
export interface ITelegramRawPhotoSize {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly width: number;
  readonly height: number;
  readonly file_size?: number;
}

export interface ITelegramRawDocument {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly file_name?: string;
  readonly mime_type?: string;
  readonly file_size?: number;
}

export interface ITelegramRawVoice {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly duration: number;
  readonly mime_type?: string;
  readonly file_size?: number;
}

export interface ITelegramRawAudio {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly duration: number;
  readonly file_name?: string;
  readonly mime_type?: string;
  readonly file_size?: number;
}

export interface ITelegramRawVideo {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly file_name?: string;
  readonly mime_type?: string;
  readonly file_size?: number;
}

export interface ITelegramRawMessageEntity {
  readonly type: string;
  readonly offset: number;
  readonly length: number;
  readonly url?: string;
}

export interface ITelegramRawChat {
  readonly id: number;
  readonly type: string;
  readonly title?: string;
}

export interface ITelegramRawUser {
  readonly id: number;
  readonly is_bot: boolean;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

/**
 * Telegram Bot API's own `Message` object, exactly as `getUpdates`/a webhook delivers it —
 * snake_case. See `toTelegramMessage` for the camelCase shape a compiled workflow actually reads.
 */
export interface ITelegramRawMessage {
  readonly message_id: number;
  readonly date: number;
  readonly text?: string;
  readonly caption?: string;
  readonly entities?: readonly ITelegramRawMessageEntity[];
  readonly chat: ITelegramRawChat;
  readonly from?: ITelegramRawUser;
  /** Service messages (ADR 0076 (private)): users who joined / the user who left or was removed. */
  readonly new_chat_members?: readonly ITelegramRawUser[];
  readonly left_chat_member?: ITelegramRawUser;
  readonly photo?: readonly ITelegramRawPhotoSize[];
  readonly document?: ITelegramRawDocument;
  readonly voice?: ITelegramRawVoice;
  readonly audio?: ITelegramRawAudio;
  readonly video?: ITelegramRawVideo;
}

export interface ITelegramUser {
  readonly id: number;
  readonly isBot: boolean;
  readonly firstName: string;
  readonly username?: string;
}

/**
 * The camelCase shape `telegram/Message` is declared with (see `telegram.integration.ts`'s
 * `telegramStructTypes`) and what a compiled workflow actually reads. `photo`/`document`/`voice`/
 * `audio`/`video` are attached separately, by `telegram-media.ts`'s `resolveIncomingMedia` — this
 * type only carries the structural fields `toTelegramMessage` itself maps.
 *
 * **Real pre-existing bug, fixed here**: `text`/`date`/`chat.id`/`chat.type`/`from.id` happen to
 * already match the raw Bot API field names one-for-one, but `from.first_name`/`from.is_bot`/
 * `message_id` do not — only the former group "worked" before this mapper existed, since
 * `telegram-backend.ts`'s `handleMessage` used to pass the raw object straight through as
 * `signalArgs` while the declared `telegram/Message` struct type the editor/compiler type-check
 * against is camelCase. See ADR 0038 (private) §5.
 */
export interface ITelegramMessage {
  readonly messageId: number;
  readonly date: number;
  readonly text?: string;
  readonly caption?: string;
  readonly entities?: readonly ITelegramMessageEntity[];
  readonly chat: ITelegramChat;
  readonly from?: ITelegramUser;
}

export interface ITelegramChat {
  readonly id: number;
  readonly type: string;
  readonly title?: string;
}

export interface ITelegramMessageEntity {
  readonly type: string;
  readonly offset: number;
  readonly length: number;
  readonly url?: string;
}

export const toTelegramUser = (raw: ITelegramRawUser | undefined): ITelegramUser | undefined =>
  raw && { id: raw.id, isBot: raw.is_bot, firstName: raw.first_name, username: raw.username };

export const toTelegramChat = (raw: ITelegramRawChat): ITelegramChat => ({
  id: raw.id,
  type: raw.type,
  title: raw.title,
});

/** Only `entities` (message text), not `caption_entities`. */
const toTelegramEntities = (
  raw: readonly ITelegramRawMessageEntity[] | undefined,
): ITelegramMessageEntity[] | undefined =>
  raw?.map((entity) => ({ type: entity.type, offset: entity.offset, length: entity.length, url: entity.url }));

/** snake_case Bot API `Message` -> camelCase `telegram/Message` — see `ITelegramMessage`'s doc comment. */
export const toTelegramMessage = (raw: ITelegramRawMessage): ITelegramMessage => ({
  messageId: raw.message_id,
  date: raw.date,
  text: raw.text,
  caption: raw.caption,
  entities: toTelegramEntities(raw.entities),
  chat: toTelegramChat(raw.chat),
  from: toTelegramUser(raw.from),
});
