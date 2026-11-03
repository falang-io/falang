/**
 * VK API's own snake_case wire shapes (`https://dev.vk.com/ru/reference/objects/message`) — only the subset the ingress
 * reads. Attachments are kept loose: `vk-media.ts` picks the kinds it turns into `files/File`s and ignores the rest.
 */
export interface IVkRawPhotoSize {
  readonly type?: string;
  readonly url?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface IVkRawAttachment {
  readonly type: string;
  readonly photo?: {
    readonly id?: number;
    readonly orig_photo?: { readonly url?: string } | null;
    readonly sizes?: readonly IVkRawPhotoSize[] | null;
  } | null;
  readonly doc?: {
    readonly id?: number;
    readonly title?: string;
    readonly ext?: string;
    readonly url?: string;
    readonly size?: number;
  } | null;
  readonly audio_message?: {
    readonly id?: number;
    readonly link_mp3?: string;
    readonly link_ogg?: string;
  } | null;
}

export interface IVkRawMessage {
  readonly id?: number;
  /** Unix time, seconds. */
  readonly date?: number;
  readonly peer_id: number;
  readonly from_id?: number;
  readonly text?: string | null;
  readonly conversation_message_id?: number;
  /** A JSON string. */
  readonly payload?: string | null;
  readonly ref?: string | null;
  readonly attachments?: readonly IVkRawAttachment[] | null;
  /** `1` for a message the community itself sent. */
  readonly out?: number;
}

export interface IVkRawUser {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
}

export interface IVkUser {
  readonly id: number;
  readonly firstName?: string;
  readonly lastName?: string;
}

/** The camelCase shape `vk/Message` is declared with (see `vk-struct-types.ts`); media is attached by `vk-media.ts`. */
export interface IVkMessage {
  readonly messageId: number;
  readonly conversationMessageId: number;
  readonly text: string;
  readonly date: number;
  readonly chat: { readonly id: number; readonly type: 'private' | 'chat' | 'group' };
  readonly from?: IVkUser;
  readonly ref?: string;
  readonly payload: unknown;
}

/** Peers: a user is its id, a conversation is 2 000 000 000 + chat id, a community is minus its id. */
export const CONVERSATION_PEER_OFFSET = 2_000_000_000;

export const vkChatTypeOf = (peerId: number): 'private' | 'chat' | 'group' => {
  if (peerId >= CONVERSATION_PEER_OFFSET) return 'chat';
  return peerId < 0 ? 'group' : 'private';
};

/** The message's `payload` parsed — `null` when absent or not a JSON object. */
export const parseVkPayload = (payload: string | null | undefined): Record<string, unknown> | null => {
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const toVkUser = (raw: IVkRawUser | null | undefined): IVkUser | undefined => {
  if (!raw) return;
  return {
    id: raw.id,
    ...(raw.first_name ? { firstName: raw.first_name } : {}),
    ...(raw.last_name ? { lastName: raw.last_name } : {}),
  };
};

/**
 * VK has no `/start` message: pressing "Начать" sends `payload = {"command":"start"}` with a text like "Начать". It is
 * delivered to the workflow as `/start` (`/start <ref>` for a `vk.me/<community>?ref=<ref>` deep link — the same text
 * Telegram sends), so an on-command trigger for `start` works the same in every messenger.
 */
const messageText = (raw: IVkRawMessage, payload: Record<string, unknown> | null): string => {
  if (payload?.command === 'start') return raw.ref ? `/start ${raw.ref}` : '/start';
  return raw.text ?? '';
};

/** snake_case VK `message` -> camelCase `vk/Message`. `from` is resolved separately (`users.get`). */
export const toVkMessage = (raw: IVkRawMessage, from: IVkUser | null | undefined): IVkMessage => {
  const payload = parseVkPayload(raw.payload);
  return {
    messageId: raw.id ?? 0,
    conversationMessageId: raw.conversation_message_id ?? 0,
    text: messageText(raw, payload),
    date: raw.date ?? 0,
    chat: { id: raw.peer_id, type: vkChatTypeOf(raw.peer_id) },
    ...(from ? { from } : {}),
    ...(raw.ref ? { ref: raw.ref } : {}),
    payload,
  };
};
