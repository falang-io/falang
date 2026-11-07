import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { parseMultipart } from './multipart.js';
/** One API call (or upload) recorded for a given community token — inspectable via the admin `/calls` route. */
export interface IVkMockCall {
  readonly method: string;
  /** All request parameters (query + form body), minus `access_token`. */
  readonly params: Record<string, string>;
  /** `messages.send`: the id the mock gave the sent message (the first one for `peer_ids`). */
  readonly messageId?: number;
  /** `messages.send`: the `conversation_message_id` of the sent message. */
  readonly conversationMessageId?: number;
  /** Upload route only: what the multipart body carried. */
  readonly upload?: {
    readonly kind: 'photo' | 'doc';
    readonly field?: string;
    readonly filename?: string;
    readonly byteLength: number;
  };
}

/** A seeded inbound file, downloadable at `<base>/files/<token>/<path>` — see `pushVkUpdate`'s `files`. */
export interface IVkMockFileSeed {
  readonly path: string;
  readonly mime: string;
  readonly base64: string;
}

/** Placeholder a test puts into a queued update's URLs; replaced with the poller's own view of this mock. */
export const VK_MOCK_BASE_PLACEHOLDER = '__VK_MOCK_BASE__';

export interface IVkStoredMessage {
  readonly id: number;
  readonly conversationMessageId: number;
  readonly peerId: number;
  text: string;
  keyboard: unknown;
  readonly date: number;
}

export interface IVkUploadSlot {
  readonly kind: 'photo' | 'doc';
}

export interface IVkTokenState {
  readonly groupId: number;
  readonly pendingUpdates: unknown[];
  readonly calls: IVkMockCall[];
  messages: IVkStoredMessage[];
  readonly files: Map<string, { mime: string; bytes: Buffer }>;
  readonly callbackServers: Map<number, { id: number; url: string; title: string; secret_key: string }>;
  readonly uploads: Map<string, IVkUploadSlot>;
  readonly cmidByPeer: Map<number, number>;
  /** `messages.removeChatUser`: `<chat_id>:<member_id>` already removed (a repeat answers error 935). */
  readonly removedMembers: Set<string>;
  /** `messages.delete`: `<peer_id>:<cmid>` already deleted (a repeat answers error 927). */
  readonly deletedMessages: Set<string>;
  /** The event flags the last `groups.setLongPollSettings` / `groups.setCallbackSettings` switched on (e.g. `group_join`). */
  readonly subscribedEvents: Set<string>;
  /** Random large offset: message ids stay globally unique across mock restarts and reruns. */
  readonly messageIdOffset: number;
  longPollKey: string;
  nextMessageId: number;
  nextEventId: number;
  nextServerId: number;
  nextUploadId: number;
  nextSavedId: number;
  /** Long Poll cursor: every `a_check` answers the current value as `ts`. */
  ts: number;
}

export const stateByToken = new Map<string, IVkTokenState>();
/** `/vk/longpoll/<pollKey>` → the token whose updates it serves. */
export const tokenByPollKey = new Map<string, string>();
/** `/vk/upload/<uploadId>` → the token that asked for the upload server. */
export const tokenByUploadId = new Map<string, string>();

export const resetAllVkMockState = (): void => {
  stateByToken.clear();
  tokenByPollKey.clear();
  tokenByUploadId.clear();
};

/** A stable community id per token, so a rerun sees the same group. */
const groupIdOf = (token: string): number =>
  100_000 + (createHash('sha256').update(token).digest().readUInt32BE(0) % 900_000);

export const getState = (token: string): IVkTokenState => {
  let state = stateByToken.get(token);
  if (!state) {
    state = {
      groupId: groupIdOf(token),
      pendingUpdates: [],
      calls: [],
      messages: [],
      files: new Map(),
      callbackServers: new Map(),
      uploads: new Map(),
      cmidByPeer: new Map(),
      removedMembers: new Set(),
      deletedMessages: new Set(),
      subscribedEvents: new Set(),
      messageIdOffset: 1_000_000 + Math.floor(Math.random() * 1_000_000_000),
      longPollKey: randomBytes(8).toString('hex'),
      nextMessageId: 1,
      nextEventId: 1,
      nextServerId: 1,
      nextUploadId: 1,
      nextSavedId: 1,
      ts: 1,
    };
    stateByToken.set(token, state);
  }
  return state;
};

export const paramString = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

/** This mock's own base URL as the caller sees it — `http://mocks:4100/vk` for backend, the kind gateway address for runner pods. */
export const baseUrlOf = (req: Request): string => `${req.protocol}://${req.get('host') ?? 'localhost'}/vk`;

export const withBase = (value: unknown, req: Request): unknown =>
  JSON.parse(JSON.stringify(value).replaceAll(VK_MOCK_BASE_PLACEHOLDER, baseUrlOf(req))) as unknown;

export class VkApiError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export const tokenOf = (req: Request, params: Record<string, string>): string | null => {
  const header = req.header('authorization');
  if (header) return header.replace(/^Bearer\s+/i, '');
  return params.access_token || null;
};

/** Query, form-urlencoded and multipart parameters merged into one flat record (VK ignores JSON bodies). */
export const collectParams = (req: Request): Record<string, string> => {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) if (typeof value === 'string') params[key] = value;
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    const contentType = req.header('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      Object.assign(params, parseMultipart(req.body, contentType).fields);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      for (const [key, value] of new URLSearchParams(req.body.toString('utf8'))) params[key] = value;
    }
  }
  return params;
};

export const requireParam = (params: Record<string, string>, name: string): string => {
  const value = params[name];
  if (!value) throw new VkApiError(100, `One of the parameters specified was missing or invalid: ${name} is undefined`);
  return value;
};

export const nextCmid = (state: IVkTokenState, peerId: number): number => {
  const next = (state.cmidByPeer.get(peerId) ?? 0) + 1;
  state.cmidByPeer.set(peerId, next);
  return next;
};

export const parseKeyboard = (raw: string | null | ''): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new VkApiError(911, 'Keyboard format is invalid');
  }
};

export const messageItem = (state: IVkTokenState, message: IVkStoredMessage): Record<string, unknown> => ({
  id: message.id,
  conversation_message_id: message.conversationMessageId,
  peer_id: message.peerId,
  from_id: -state.groupId,
  date: message.date,
  text: message.text,
  out: 1,
  ...(message.keyboard ? { keyboard: message.keyboard } : {}),
});
