import { randomBytes } from 'node:crypto';
import { assertVkPeerNotBlocked } from './blocked-chats.js';
import {
  VkApiError,
  messageItem,
  nextCmid,
  parseKeyboard,
  requireParam,
  tokenByPollKey,
  tokenByUploadId,
  type IVkMockCall,
  type IVkStoredMessage,
  type IVkTokenState,
} from './vk-state.js';

export interface IMethodResult {
  readonly response: unknown;
  readonly record?: Partial<IVkMockCall>;
}

interface IMethodContext {
  readonly state: IVkTokenState;
  readonly params: Record<string, string>;
  /** `<base>/vk` as the request's own `Host` sees it. */
  readonly baseUrl: string;
  readonly token: string;
}

type TMethodHandler = (context: IMethodContext) => IMethodResult;

const ok = (): IMethodResult => ({ response: 1 });

const sendMessages = ({ state, params, token }: IMethodContext): IMethodResult => {
  assertVkPeerNotBlocked(token, params.peer_id);
  const text = params.message ?? '';
  const keyboard = parseKeyboard(params.keyboard ?? null);
  const single = Boolean(params.peer_id);
  const peers = (single ? [params.peer_id] : requireParam(params, 'peer_ids').split(',')).map(Number);
  const sent = peers.map((peerId) => {
    const message: IVkStoredMessage = {
      id: state.messageIdOffset + state.nextMessageId,
      conversationMessageId: nextCmid(state, peerId),
      peerId,
      text,
      keyboard,
      date: Math.floor(Date.now() / 1000),
    };
    state.nextMessageId += 1;
    state.messages.push(message);
    return message;
  });
  const [first] = sent;
  const record = { messageId: first.id, conversationMessageId: first.conversationMessageId };
  if (single) return { response: first.id, record };
  return {
    response: sent.map((m) => ({
      peer_id: m.peerId,
      message_id: m.id,
      conversation_message_id: m.conversationMessageId,
    })),
    record,
  };
};

const findMessage = (state: IVkTokenState, params: Record<string, string>): IVkStoredMessage => {
  const peerId = Number(requireParam(params, 'peer_id'));
  const found = state.messages.find(
    (m) =>
      m.peerId === peerId &&
      (params.message_id
        ? m.id === Number(params.message_id)
        : m.conversationMessageId === Number(params.conversation_message_id)),
  );
  if (!found) throw new VkApiError(100, 'One of the parameters specified was missing or invalid: message not found');
  return found;
};

const editMessage = ({ state, params }: IMethodContext): IMethodResult => {
  const message = findMessage(state, params);
  message.text = params.message ?? message.text;
  if ('keyboard' in params) message.keyboard = parseKeyboard(params.keyboard);
  return ok();
};

const getByConversationMessageId = ({ state, params }: IMethodContext): IMethodResult => {
  const peerId = Number(requireParam(params, 'peer_id'));
  const ids = requireParam(params, 'conversation_message_ids').split(',').map(Number);
  const items = ids.flatMap((cmid) =>
    state.messages
      .filter((m) => m.peerId === peerId && m.conversationMessageId === cmid)
      .map((m) => messageItem(state, m)),
  );
  return { response: { count: items.length, items } };
};

const getLongPollServer = ({ state, baseUrl, token }: IMethodContext): IMethodResult => {
  // A fresh key per call: the previous one stops working, like real VK after a `failed: 2` refresh.
  const pollKey = randomBytes(8).toString('hex');
  tokenByPollKey.set(pollKey, token);
  state.longPollKey = randomBytes(8).toString('hex');
  return { response: { server: `${baseUrl}/longpoll/${pollKey}`, key: state.longPollKey, ts: String(state.ts) } };
};

const addCallbackServer = ({ state, params }: IMethodContext): IMethodResult => {
  const id = state.nextServerId;
  state.nextServerId += 1;
  state.callbackServers.set(id, {
    id,
    url: requireParam(params, 'url'),
    title: params.title ?? '',
    secret_key: params.secret_key ?? '',
  });
  return { response: { server_id: id } };
};

const uploadServer =
  (kind: 'photo' | 'doc'): TMethodHandler =>
  ({ state, baseUrl, token }) => {
    const uploadId = `${randomBytes(6).toString('hex')}${state.nextUploadId}`;
    state.nextUploadId += 1;
    state.uploads.set(uploadId, { kind });
    tokenByUploadId.set(uploadId, token);
    return { response: { upload_url: `${baseUrl}/upload/${uploadId}` } };
  };

const saveMessagesPhoto = ({ state, params }: IMethodContext): IMethodResult => {
  requireParam(params, 'photo');
  const id = state.nextSavedId;
  state.nextSavedId += 1;
  return { response: [{ id, owner_id: -state.groupId, access_key: `mockkey${id}` }] };
};

const saveDoc = ({ state, params, baseUrl }: IMethodContext): IMethodResult => {
  requireParam(params, 'file');
  const id = state.nextSavedId;
  state.nextSavedId += 1;
  const title = params.title ?? 'file';
  return {
    response: {
      type: 'doc',
      doc: {
        id,
        owner_id: -state.groupId,
        title,
        ext: title.split('.').pop() ?? '',
        url: `${baseUrl}/files/doc${id}`,
        access_key: `mockkey${id}`,
      },
    },
  };
};

const SETTINGS_NON_EVENT_PARAMS = new Set(['group_id', 'server_id', 'enabled', 'api_version']);

/** Both settings calls: every `<event>=1` parameter is an event the community now receives. */
const setEventSettings = ({ state, params }: IMethodContext): IMethodResult => {
  state.subscribedEvents.clear();
  for (const [name, value] of Object.entries(params)) {
    if (!SETTINGS_NON_EVENT_PARAMS.has(name) && value === '1') state.subscribedEvents.add(name);
  }
  return ok();
};

/** Kicking a user who is not (any more) in the chat is VK error 935. */
const removeChatUser = ({ state, params }: IMethodContext): IMethodResult => {
  const chatId = requireParam(params, 'chat_id');
  const memberId = params.member_id ?? requireParam(params, 'user_id');
  const key = `${chatId}:${memberId}`;
  if (state.removedMembers.has(key)) throw new VkApiError(935, 'User not found in chat');
  state.removedMembers.add(key);
  return ok();
};

/** Deleting a message in a chat that no longer has it answers error 927 (the mock's stand-in for "already gone"). */
const deleteMessages = ({ state, params }: IMethodContext): IMethodResult => {
  const peerId = requireParam(params, 'peer_id');
  const cmids = requireParam(params, 'cmids').split(',');
  const keys = cmids.map((cmid) => `${peerId}:${cmid}`);
  if (keys.every((key) => state.deletedMessages.has(key))) throw new VkApiError(927, 'Chat does not exist');
  for (const key of keys) state.deletedMessages.add(key);
  state.messages = state.messages.filter((m) => !keys.includes(`${m.peerId}:${m.conversationMessageId}`));
  return { response: Object.fromEntries(cmids.map((cmid) => [cmid, 1])) };
};

const METHODS: Record<string, TMethodHandler> = {
  'groups.getById': ({ state }) => ({
    response: {
      groups: [{ id: state.groupId, name: 'Mock community', screen_name: `mock_community_${state.groupId}` }],
      profiles: [],
    },
  }),
  'groups.setLongPollSettings': setEventSettings,
  'groups.setCallbackSettings': setEventSettings,
  'messages.removeChatUser': removeChatUser,
  'messages.delete': deleteMessages,
  'messages.sendMessageEventAnswer': ok,
  'messages.setActivity': ok,
  'groups.getLongPollServer': getLongPollServer,
  'groups.getCallbackConfirmationCode': ({ state }) => ({ response: { code: `mock_confirm_${state.groupId}` } }),
  'groups.getCallbackServers': ({ state }) => ({
    response: { count: state.callbackServers.size, items: [...state.callbackServers.values()] },
  }),
  'groups.addCallbackServer': addCallbackServer,
  'groups.deleteCallbackServer': ({ state, params }) => {
    state.callbackServers.delete(Number(requireParam(params, 'server_id')));
    return ok();
  },
  'messages.send': sendMessages,
  'messages.edit': editMessage,
  'messages.getByConversationMessageId': getByConversationMessageId,
  'users.get': ({ params }) => ({
    response: (params.user_ids ?? '')
      .split(',')
      .filter(Boolean)
      .map((id) => ({ id: Number(id), first_name: 'User', last_name: id })),
  }),
  'photos.getMessagesUploadServer': uploadServer('photo'),
  'docs.getMessagesUploadServer': uploadServer('doc'),
  'photos.saveMessagesPhoto': saveMessagesPhoto,
  'docs.save': saveDoc,
};

export const runVkMethod = (name: string, context: IMethodContext): IMethodResult => {
  const handler = Object.hasOwn(METHODS, name) ? METHODS[name] : null;
  if (!handler) throw new VkApiError(3, 'Unknown method passed');
  return handler(context);
};
