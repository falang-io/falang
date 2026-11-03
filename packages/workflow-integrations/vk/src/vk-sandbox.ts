import type {
  ISandboxBotAdapter,
  ISandboxBotInfo,
  ISandboxIngressContext,
  ISandboxUpdateInfo,
  TSandboxRelayDecision,
} from '@falang/workflow-integrations-common';
import {
  startVkCallbackIngress,
  startVkLongPollIngress,
  vkApiJson,
  vkGetGroupId,
  VK_API_BASE_URL,
  type IVkUpdate,
} from './vk-backend.js';
import { vkChatTypeOf, type IVkRawMessage } from './vk-message-mapper.js';

/** Label of the derived callback secret is chosen by the host (`ctx.secret`); VK's `secret_key` allows 50 characters. */
const MAX_SECRET_LENGTH = 50;

/**
 * Allowed body parameters per relayable method. The test bot is ONE community shared by every customer, and VK lets a
 * request refer to other people's data (`forward_messages`/`forward` re-send messages of other dialogs, attachments are
 * addressed by guessable ids), so anything not listed here is refused.
 */
const ALLOWED_PARAMS: Readonly<Record<string, ReadonlySet<string>>> = {
  'messages.send': new Set([
    'peer_id',
    'peer_ids',
    'random_id',
    'message',
    'attachment',
    'keyboard',
    'dont_parse_links',
    'disable_mentions',
    'v',
  ]),
  'messages.edit': new Set([
    'peer_id',
    'message_id',
    'conversation_message_id',
    'message',
    'keyboard',
    'attachment',
    'keep_forward_messages',
    'keep_snippets',
    'dont_parse_links',
    'disable_mentions',
    'v',
  ]),
  'messages.getByConversationMessageId': new Set(['peer_id', 'conversation_message_ids', 'v']),
  'messages.setActivity': new Set(['peer_id', 'type', 'v']),
  'photos.getMessagesUploadServer': new Set(['peer_id', 'v']),
  'docs.getMessagesUploadServer': new Set(['peer_id', 'type', 'v']),
  'photos.saveMessagesPhoto': new Set(['photo', 'server', 'hash', 'v']),
  'docs.save': new Set(['file', 'title', 'tags', 'v']),
};

/** Methods whose recipient is the `peer_id` parameter. */
const PEER_METHODS: ReadonlySet<string> = new Set([
  'messages.edit',
  'messages.getByConversationMessageId',
  'messages.setActivity',
  'photos.getMessagesUploadServer',
  'docs.getMessagesUploadServer',
]);

/** Second step of an upload: the file is already on VK's server, nothing addresses a chat. */
const UNADDRESSED_METHODS: ReadonlySet<string> = new Set(['photos.saveMessagesPhoto', 'docs.save']);

/** An attachment must carry the `access_key` VK hands out only to the uploader. */
const ATTACHMENT_PATTERN = /^(photo|doc)-?\d+_\d+_[A-Za-z0-9]+$/;

const METHOD_PATH_PATTERN = /^\/method\/([A-Za-z0-9_.]+)$/;
const PEER_ID_PATTERN = /^-?\d+$/;

interface IVkSandboxMessageEvent {
  readonly peer_id?: number;
}

interface IVkSandboxMessageNew {
  readonly message?: IVkRawMessage;
}

const describeUpdate = (raw: unknown): ISandboxUpdateInfo | null => {
  const update = raw as IVkUpdate | null;
  if (update?.type === 'message_new') {
    const object = update.object as (IVkSandboxMessageNew & Partial<IVkRawMessage>) | null | undefined;
    const message = object?.message ?? (object as IVkRawMessage | null | undefined);
    // The community's own messages come back as events too.
    if (!message?.peer_id || message.out === 1) return null;
    return {
      chatId: String(message.peer_id),
      isPrivateChat: vkChatTypeOf(message.peer_id) === 'private',
      startPayload: message.ref ?? null,
      text: message.text ?? null,
      // VK updates carry no names and the call has to stay synchronous.
      chatTitle: message.from_id ? `id${message.from_id}` : null,
    };
  }
  if (update?.type === 'message_event') {
    const event = update.object as IVkSandboxMessageEvent | null | undefined;
    if (!event?.peer_id) return null;
    return {
      chatId: String(event.peer_id),
      isPrivateChat: vkChatTypeOf(event.peer_id) === 'private',
      startPayload: null,
      text: null,
      chatTitle: null,
    };
  }
  // `confirmation` and everything else are not routed.
  return null;
};

const startIngress = async (ctx: ISandboxIngressContext): Promise<() => Promise<void>> => {
  const accessToken = ctx.token;
  const groupId = await vkGetGroupId(accessToken);
  const onUpdate = (update: IVkUpdate): Promise<void> => ctx.onUpdate(update);
  if (ctx.webhookUrl) {
    return startVkCallbackIngress({
      accessToken,
      groupId,
      onUpdate,
      webhookUrl: ctx.webhookUrl,
      secret: ctx.secret.slice(0, MAX_SECRET_LENGTH),
      registerWebHook: (handler) => ctx.registerWebHook(handler),
    });
  }
  return startVkLongPollIngress({
    accessToken,
    groupId,
    onUpdate,
    registerInterval: (callback, intervalMs) => ctx.registerInterval(callback, intervalMs),
  });
};

const bearerToken = (request: Request): string | null => {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
};

const readParams = async (request: Request): Promise<URLSearchParams | null> => {
  try {
    const form = await request.formData();
    const params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') params.append(key, value);
    }
    return params;
  } catch {
    return null;
  }
};

const singlePeerId = (params: URLSearchParams, name: string): string | null => {
  const values = params.getAll(name);
  return values.length === 1 && PEER_ID_PATTERN.test(values[0].trim()) ? values[0].trim() : null;
};

const checkParams = (method: string, allowed: ReadonlySet<string>, params: URLSearchParams): string | null => {
  for (const key of params.keys()) {
    if (!allowed.has(key)) return `Parameter ${key} is not allowed in ${method}`;
  }
  if (!params.has('attachment')) return null;
  const values = params.getAll('attachment');
  if (values.length !== 1) return 'Exactly one attachment parameter is allowed';
  const valid = values[0].split(',').every((item) => ATTACHMENT_PATTERN.test(item.trim()));
  return valid ? null : 'attachments must carry an access key and be a photo or a doc';
};

/**
 * The calls the VK activities of this package make through the relay. The relay token is the pod's
 * `Authorization: Bearer`. The query may hold only `v`, so query and form body can never disagree about a recipient.
 * `messages.sendMessageEventAnswer` is host-side only; `groups.*` is never allowed.
 */
const inspect = async (request: Request, path: string): Promise<TSandboxRelayDecision> => {
  const relayToken = bearerToken(request);
  if (!relayToken) return { error: 'Authorization: Bearer is required' };
  const match = METHOD_PATH_PATTERN.exec(path);
  if (!match || request.method.toUpperCase() !== 'POST') {
    return { error: `${request.method.toUpperCase()} ${path} is not allowed in the test bot` };
  }
  const method = match[1];
  const query = new URL(request.url, 'http://relay.invalid').searchParams;
  for (const key of query.keys()) {
    if (key !== 'v') return { error: `Query parameter ${key} is not allowed` };
  }
  const isSend = method === 'messages.send';
  const allowed = ALLOWED_PARAMS[method];
  if (!allowed) return { error: `VK method ${method} is not allowed in the test bot` };

  const params = await readParams(request);
  if (!params) return { error: 'The request body must be form data' };
  const problem = checkParams(method, allowed, params);
  if (problem) return { error: problem };
  if (UNADDRESSED_METHODS.has(method)) return { method, recipients: [], unaddressed: true, relayToken };
  if (isSend) {
    const hasPeerId = params.has('peer_id');
    const hasPeerIds = params.has('peer_ids');
    if (hasPeerId === hasPeerIds) return { error: 'Exactly one of peer_id or peer_ids is required' };
    const peer = singlePeerId(params, hasPeerId ? 'peer_id' : 'peer_ids');
    if (!peer) return { error: 'Exactly one numeric peer is required' };
    return { method, recipients: [peer], relayToken };
  }
  if (!PEER_METHODS.has(method)) return { error: `VK method ${method} is not allowed in the test bot` };
  const peer = singlePeerId(params, 'peer_id');
  if (!peer) return { error: 'peer_id is required' };
  return { method, recipients: [peer], relayToken };
};

const getBotInfo = async (token: string): Promise<ISandboxBotInfo> => {
  const response = await vkApiJson<{ groups?: readonly IVkGroup[] } | readonly IVkGroup[]>(token, 'groups.getById');
  const list = Array.isArray(response) ? response : ((response as { groups?: readonly IVkGroup[] }).groups ?? []);
  const group = list[0];
  if (!group?.id) throw new Error('VK groups.getById returned no community for this access key');
  return {
    username: group.screen_name || `club${group.id}`,
    title: group.name ?? group.screen_name ?? `club${group.id}`,
  };
};

interface IVkGroup {
  readonly id: number;
  readonly name?: string;
  readonly screen_name?: string;
}

/** A 31-bit random `random_id`: VK deduplicates the same id for an hour. */
const randomId = (): number => Math.floor(Math.random() * 2_147_483_647) + 1;

/** VK's half of the sandbox bot (ADR 0073 (private)); browser-safe like the rest of this package's barrel. */
export const vkSandboxAdapter: ISandboxBotAdapter = {
  tokenField: 'accessToken',
  startIngress,
  describeUpdate,
  async sendText(token, chatId, text) {
    await vkApiJson(token, 'messages.send', { peer_id: chatId, random_id: randomId(), message: text });
  },
  getBotInfo,
  buildChatLink: (info, payload) => `https://vk.me/${info.username}?ref=${encodeURIComponent(payload)}`,
  relay: {
    inspect,
    upstreamUrl: (_token, path, search) => `${VK_API_BASE_URL}${path}${search}`,
    upstreamHeaders: (token) => ({ Authorization: `Bearer ${token}` }),
  },
};
