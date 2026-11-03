// oxlint-disable max-lines, typescript-eslint/no-non-null-assertion, init-declarations, no-await-in-loop -- test captures handlers registered through callbacks.
import type { ISandboxIngressContext } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vkSandboxAdapter as adapter } from './vk-sandbox.js';
import { vkIntegration } from './vk.integration.js';

const vkOk = (response: unknown = 1): Response => Response.json({ response });

const raw = (extra: Record<string, unknown> = {}) => ({
  id: 5,
  peer_id: 7,
  from_id: 7,
  text: 'hi',
  date: 1,
  ...extra,
});
const messageNew = (extra: Record<string, unknown> = {}) => ({
  type: 'message_new',
  object: { message: raw(extra) },
});

const form = (params: Record<string, string>) => new URLSearchParams(params).toString();
const post = (
  params: Record<string, string> | null,
  { query = '?v=5.199', token = 'relay-tok' as string | null } = {},
): Request =>
  new Request(`http://relay.invalid/x${query}`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params ? form(params) : null,
  });

describe('vk sandbox adapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(vkOk());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is the sandbox adapter of the vendor', () => {
    expect(vkIntegration.sandbox).toBe(adapter);
    expect(adapter.tokenField).toBe('accessToken');
  });

  describe('describeUpdate', () => {
    it('describes a private message with its ref', () => {
      expect(adapter.describeUpdate(messageNew({ ref: 'fl_abc' }))).toEqual({
        chatId: '7',
        isPrivateChat: true,
        startPayload: 'fl_abc',
        text: 'hi',
        chatTitle: 'id7',
      });
      expect(adapter.describeUpdate(messageNew())).toMatchObject({ startPayload: null });
    });

    it('marks a conversation as not private and skips outgoing messages', () => {
      expect(adapter.describeUpdate(messageNew({ peer_id: 2_000_000_003 }))).toMatchObject({
        chatId: '2000000003',
        isPrivateChat: false,
      });
      expect(adapter.describeUpdate(messageNew({ out: 1 }))).toBeNull();
    });

    it('describes a button press without text', () => {
      expect(
        adapter.describeUpdate({ type: 'message_event', object: { peer_id: 7, user_id: 7, event_id: 'e' } }),
      ).toEqual({ chatId: '7', isPrivateChat: true, startPayload: null, text: null, chatTitle: null });
    });

    it('ignores confirmation and unknown updates', () => {
      expect(adapter.describeUpdate({ type: 'confirmation', group_id: 1 })).toBeNull();
      expect(adapter.describeUpdate({ type: 'wall_post_new', object: {} })).toBeNull();
      expect(adapter.describeUpdate(null)).toBeNull();
    });
  });

  describe('relay.inspect', () => {
    it('allows messages.send to exactly one peer', async () => {
      expect(await adapter.relay.inspect(post({ peer_id: '7', message: 'x' }), '/method/messages.send')).toEqual({
        method: 'messages.send',
        recipients: ['7'],
        relayToken: 'relay-tok',
        sendsMessage: true,
      });
      expect(await adapter.relay.inspect(post({ peer_ids: '7' }), '/method/messages.send')).toMatchObject({
        recipients: ['7'],
      });
    });

    it('reads a multipart body too', async () => {
      const body = new FormData();
      body.set('peer_id', '9');
      const request = new Request('http://relay.invalid/x?v=5.199', {
        method: 'POST',
        headers: { authorization: 'Bearer t' },
        body,
      });
      expect(await adapter.relay.inspect(request, '/method/messages.send')).toMatchObject({ recipients: ['9'] });
    });

    it('refuses malformed send addressing', async () => {
      const send = (params: Record<string, string>) => adapter.relay.inspect(post(params), '/method/messages.send');
      const cases: Record<string, string>[] = [
        {},
        { peer_id: '7', peer_ids: '7' },
        { peer_ids: '7,8' },
        { peer_id: 'abc' },
        { peer_id: '7', user_id: '8' },
        { peer_id: '7', user_ids: '8' },
        { peer_id: '7', chat_id: '1' },
        { peer_id: '7', domain: 'durov' },
      ];
      for (const params of cases) {
        expect(await send(params)).toHaveProperty('error');
      }
    });

    it('addresses peer-bound methods by peer_id', async () => {
      for (const method of [
        'messages.edit',
        'messages.getByConversationMessageId',
        'messages.setActivity',
        'photos.getMessagesUploadServer',
        'docs.getMessagesUploadServer',
      ]) {
        expect(await adapter.relay.inspect(post({ peer_id: '7' }), `/method/${method}`)).toMatchObject({
          method,
          recipients: ['7'],
        });
        expect(await adapter.relay.inspect(post({}), `/method/${method}`)).toHaveProperty('error');
      }
    });

    it('refuses parameters outside the per-method allowlist', async () => {
      const send = (params: Record<string, string>, method = 'messages.send') =>
        adapter.relay.inspect(post(params), `/method/${method}`);
      for (const extra of ['forward_messages', 'forward', 'reply_to', 'user_id', 'sticker_id', 'unknown']) {
        expect(await send({ peer_id: '7', [extra]: '1' })).toHaveProperty('error');
      }
      expect(await send({ peer_id: '7', forward: '{}' }, 'messages.edit')).toHaveProperty('error');
      expect(await send({ photo: 'x', owner_id: '1' }, 'photos.saveMessagesPhoto')).toHaveProperty('error');
    });

    it('requires an access key on attachments of a photo or doc only', async () => {
      const send = (attachment: string, method = 'messages.send') =>
        adapter.relay.inspect(post({ peer_id: '7', attachment }), `/method/${method}`);
      for (const bad of ['photo-1_2', 'wall-1_2_k', 'audio1_2_k', 'photo-1_2_k,doc-3_4', 'doc1_2_k;x']) {
        expect(await send(bad)).toHaveProperty('error');
      }
      expect(await send('photo-1_2_ab12CD')).toMatchObject({ recipients: ['7'] });
      expect(await send('photo-1_2_ab,doc3_4_cd')).toMatchObject({ recipients: ['7'] });
      expect(await send('doc-1_2_ab', 'messages.edit')).toMatchObject({ recipients: ['7'] });
    });

    it('lets through every parameter the activities send', async () => {
      const cases: [string, Record<string, string>][] = [
        ['messages.send', { peer_id: '7', random_id: '1', message: 'm', attachment: 'doc1_2_k', keyboard: '{}' }],
        ['messages.send', { peer_ids: '7', random_id: '1', message: 'm', keyboard: '{}', v: '5.199' }],
        ['messages.getByConversationMessageId', { peer_id: '7', conversation_message_ids: '3' }],
        ['messages.edit', { peer_id: '7', conversation_message_id: '3', message: 'm', keyboard: '{}' }],
        ['messages.setActivity', { peer_id: '7', type: 'typing' }],
        ['photos.getMessagesUploadServer', { peer_id: '7' }],
        ['docs.getMessagesUploadServer', { peer_id: '7', type: 'doc' }],
      ];
      for (const [method, params] of cases) {
        expect(await adapter.relay.inspect(post(params), `/method/${method}`)).not.toHaveProperty('error');
      }
    });

    it('allows upload saves as unaddressed', async () => {
      const bodies: Record<string, Record<string, string>> = {
        'photos.saveMessagesPhoto': { photo: 'x', server: '1', hash: 'h' },
        'docs.save': { file: 'x', title: 't' },
      };
      for (const method of ['photos.saveMessagesPhoto', 'docs.save']) {
        expect(await adapter.relay.inspect(post(bodies[method]), `/method/${method}`)).toEqual({
          method,
          recipients: [],
          unaddressed: true,
          relayToken: 'relay-tok',
        });
      }
    });

    it('refuses everything else, foreign queries, other verbs and a missing token', async () => {
      for (const method of [
        'messages.sendMessageEventAnswer',
        'groups.getById',
        'groups.setCallbackSettings',
        'users.get',
      ]) {
        expect(await adapter.relay.inspect(post({ peer_id: '7' }), `/method/${method}`)).toHaveProperty('error');
      }
      expect(await adapter.relay.inspect(post({ peer_id: '7' }), '/other')).toHaveProperty('error');
      expect(
        await adapter.relay.inspect(post({ peer_id: '7' }, { query: '?v=5.199&peer_id=8' }), '/method/messages.send'),
      ).toHaveProperty('error');
      expect(
        await adapter.relay.inspect(post({ peer_id: '7' }, { token: null }), '/method/messages.send'),
      ).toHaveProperty('error');
      const get = new Request('http://relay.invalid/x', { headers: { authorization: 'Bearer t' } });
      expect(await adapter.relay.inspect(get, '/method/messages.send')).toHaveProperty('error');
    });

    it('classifies the answers that mean the community cannot write to the user', () => {
      const send = { method: 'messages.send', recipients: ['7'], relayToken: 't', sendsMessage: true };
      const unreachable = adapter.relay.isChatUnreachable!;
      expect(unreachable(send, 200, { error: { error_code: 901, error_msg: 'no permission' } })).toBe(true);
      expect(unreachable(send, 200, { error: { error_code: 900 } })).toBe(true);
      expect(unreachable(send, 200, { response: [{ peer_id: 7, error: { code: 902, description: 'privacy' } }] })).toBe(
        true,
      );
      expect(unreachable(send, 200, { response: [{ peer_id: 7, message_id: 1 }] })).toBe(false);
      expect(unreachable(send, 200, { error: { error_code: 6 } })).toBe(false);
      expect(unreachable({ ...send, method: 'messages.edit' }, 200, { error: { error_code: 901 } })).toBe(false);
    });

    it('builds the upstream URL and headers from the real token', () => {
      expect(adapter.relay.upstreamUrl('real', '/method/messages.send', '?v=5.199')).toMatch(
        /^https?:\/\/.+\/method\/messages\.send\?v=5\.199$/,
      );
      expect(adapter.relay.upstreamHeaders!('real')).toEqual({ Authorization: 'Bearer real' });
    });
  });

  describe('startIngress', () => {
    const buildCtx = (webhookUrl: string | null) => {
      const state: { webhook?: (r: Request) => Promise<Response>; interval?: () => Promise<void> } = {};
      const onUpdate = vi.fn().mockResolvedValue(null);
      const ctx: ISandboxIngressContext = {
        token: 'tok',
        webhookUrl,
        secret: 'sec',
        registerWebHook: (h) => {
          state.webhook = (r) => h(r, { ip: '1.1.1.1' }) as Promise<Response>;
        },
        registerInterval: (cb) => {
          state.interval = cb;
        },
        onUpdate,
      };
      return { ctx, state, onUpdate };
    };
    const methodsCalled = () => fetchMock.mock.calls.map(([url]) => /\/method\/([^?]+)/.exec(String(url))?.[1]);

    it('Callback API: confirms, checks the secret, answers ok and deletes the server on dispose', async () => {
      fetchMock.mockImplementation((url: string) => {
        const method = /\/method\/([^?]+)/.exec(String(url))?.[1];
        const answers: Record<string, unknown> = {
          'groups.getById': { groups: [{ id: 11 }] },
          'groups.getCallbackConfirmationCode': { code: 'conf-code' },
          'groups.getCallbackServers': { items: [{ id: 3, url: 'https://x/hook' }] },
          'groups.addCallbackServer': { server_id: 9 },
        };
        return Promise.resolve(vkOk(answers[method!] ?? 1));
      });
      const { ctx, state, onUpdate } = buildCtx('https://x/hook');
      const dispose = await adapter.startIngress(ctx);
      expect(methodsCalled()).toEqual([
        'groups.getById',
        'groups.getCallbackConfirmationCode',
        'groups.getCallbackServers',
        'groups.deleteCallbackServer',
        'groups.addCallbackServer',
        'groups.setCallbackSettings',
      ]);
      const added = new URLSearchParams(String(fetchMock.mock.calls[4][1].body));
      expect(added.get('secret_key')).toBe('sec');

      const confirmation = await state.webhook!(
        new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'confirmation', group_id: 11 }) }),
      );
      expect(await confirmation.text()).toBe('conf-code');
      const bad = await state.webhook!(
        new Request('http://x', { method: 'POST', body: JSON.stringify({ ...messageNew(), secret: 'nope' }) }),
      );
      expect(bad.status).toBe(401);
      const good = await state.webhook!(
        new Request('http://x', { method: 'POST', body: JSON.stringify({ ...messageNew(), secret: 'sec' }) }),
      );
      expect(good.status).toBe(200);
      expect(await good.text()).toBe('ok');
      expect(onUpdate).toHaveBeenCalledTimes(1);

      await dispose();
      expect(methodsCalled().at(-1)).toBe('groups.deleteCallbackServer');
      expect(new URLSearchParams(String(fetchMock.mock.calls.at(-1)![1].body)).get('server_id')).toBe('9');
    });

    it('Long Poll: hands updates over in order and advances ts', async () => {
      fetchMock.mockImplementation((url: string) => {
        const text = String(url);
        if (text.includes('act=a_check')) {
          return Promise.resolve(Response.json({ ts: '6', updates: [messageNew(), messageNew({ id: 6 })] }));
        }
        const method = /\/method\/([^?]+)/.exec(text)?.[1];
        const answers: Record<string, unknown> = {
          'groups.getById': { groups: [{ id: 11 }] },
          'groups.getLongPollServer': { server: 'https://lp.example/path', key: 'k', ts: '5' },
        };
        return Promise.resolve(vkOk(answers[method!] ?? 1));
      });
      const { ctx, state, onUpdate } = buildCtx(null);
      await adapter.startIngress(ctx);
      await state.interval!();
      expect(onUpdate).toHaveBeenCalledTimes(2);
      await state.interval!();
      expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('ts=6');
    });
  });

  describe('sendText / getBotInfo / buildChatLink', () => {
    it('sends a plain message with a random_id and the bearer token', async () => {
      await adapter.sendText('tok', '7', 'hello');
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/method/messages.send?v=5.199');
      expect(init.headers.Authorization).toBe('Bearer tok');
      const body = new URLSearchParams(String(init.body));
      expect(body.get('peer_id')).toBe('7');
      expect(body.get('message')).toBe('hello');
      expect(Number(body.get('random_id'))).toBeGreaterThan(0);
      fetchMock.mockResolvedValueOnce(Response.json({ error: { error_code: 5, error_msg: 'bad' } }));
      await expect(adapter.sendText('tok', '7', 'x')).rejects.toThrow('5 bad');
    });

    it('reads the community identity', async () => {
      fetchMock.mockResolvedValueOnce(vkOk({ groups: [{ id: 11, name: 'My bot', screen_name: 'my_bot' }] }));
      expect(await adapter.getBotInfo('tok')).toEqual({ username: 'my_bot', title: 'My bot' });
      fetchMock.mockResolvedValueOnce(vkOk({ groups: [{ id: 11, name: 'My bot', screen_name: '' }] }));
      expect(await adapter.getBotInfo('tok')).toEqual({ username: 'club11', title: 'My bot' });
      fetchMock.mockResolvedValueOnce(Response.json({ error: { error_code: 5, error_msg: 'invalid access_token' } }));
      await expect(adapter.getBotInfo('bad')).rejects.toThrow('invalid access_token');
    });

    it('builds the deep link', () => {
      expect(adapter.buildChatLink({ username: 'my_bot', title: 'T' }, 'fl_a-b')).toBe(
        'https://vk.me/my_bot?ref=fl_a-b',
      );
    });
  });
});
