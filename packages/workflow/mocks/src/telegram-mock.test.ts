import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTelegramCalls, pushTelegramUpdate, resetTelegramMock } from './client.js';
import { startTestServer, type ITestServer } from './test-server.js';

const sendMessage = (baseUrl: string, token: string, body: unknown): Promise<Response> =>
  fetch(`${baseUrl}/telegram/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('telegram mock', () => {
  // oxlint-disable-next-line init-declarations
  let server: ITestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('records sendMessage calls and returns an incrementing message_id per token', async () => {
    const response1 = await sendMessage(server.url, '123:ABC', { chat_id: 42, text: 'hi' });
    expect(await response1.json()).toEqual({
      ok: true,
      result: { message_id: 1, date: expect.any(Number), chat: { id: 42, type: 'private' }, text: 'hi' },
    });

    const response2 = await sendMessage(server.url, '123:ABC', { chat_id: 42, text: 'again' });
    const body2 = (await response2.json()) as { result: { message_id: number } };
    expect(body2.result.message_id).toBe(2);

    const calls = await getTelegramCalls(server.url, '123:ABC');
    expect(calls).toEqual([
      { method: 'sendMessage', body: { chat_id: 42, text: 'hi' } },
      { method: 'sendMessage', body: { chat_id: 42, text: 'again' } },
    ]);
  });

  it('editMessageReplyMarkup/answerCallbackQuery/setWebhook/deleteWebhook all return {ok:true} and get recorded', async () => {
    const token = '123:DEF';
    const routes = [
      'editMessageReplyMarkup',
      'answerCallbackQuery',
      'setWebhook',
      'deleteWebhook',
      'setMyCommands',
      'deleteMyCommands',
    ];
    const responses = await Promise.all(
      routes.map((route) =>
        fetch(`${server.url}/telegram/bot${token}/${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ marker: route }),
        }).then((response) => response.json()),
      ),
    );
    expect(responses).toEqual(routes.map(() => ({ ok: true, result: true })));

    const calls = await getTelegramCalls(server.url, token);
    expect(calls.map((call) => call.method)).toEqual(expect.arrayContaining(routes));
  });

  it('getUpdates returns queued updates once, then clears them', async () => {
    const token = '123:GHI';
    await pushTelegramUpdate(server.url, token, {
      message: { message_id: 1, date: 0, chat: { id: 42, type: 'private' }, text: 'hello' },
    });

    const first = await fetch(`${server.url}/telegram/bot${token}/getUpdates`);
    const firstBody = (await first.json()) as { result: readonly { update_id: number }[] };
    expect(firstBody.result).toHaveLength(1);
    expect(firstBody.result[0]).toEqual(
      expect.objectContaining({ update_id: 1, message: expect.objectContaining({ text: 'hello' }) }),
    );

    const second = await fetch(`${server.url}/telegram/bot${token}/getUpdates`);
    expect(await second.json()).toEqual({ ok: true, result: [] });
  });

  it('partitions state per bot token — a call/update for one token never appears for another', async () => {
    await sendMessage(server.url, 'tokenA', { chat_id: 1, text: 'a' });
    await pushTelegramUpdate(server.url, 'tokenA', { message: { text: 'a' } });

    expect(await getTelegramCalls(server.url, 'tokenB')).toEqual([]);
    const tokenBUpdates = await fetch(`${server.url}/telegram/bottokenB/getUpdates`);
    expect(await tokenBUpdates.json()).toEqual({ ok: true, result: [] });
  });

  it('reset clears recorded calls for that token', async () => {
    const token = '123:JKL';
    await sendMessage(server.url, token, { chat_id: 1, text: 'a' });
    expect(await getTelegramCalls(server.url, token)).toHaveLength(1);

    await resetTelegramMock(server.url, token);

    expect(await getTelegramCalls(server.url, token)).toEqual([]);
  });

  describe('media (getFile / download / send-file)', () => {
    const token = '123:MED';
    const base64 = Buffer.from('hello bytes').toString('base64');

    it('getFile resolves a seeded file_id to its file_path, and the download route serves the bytes', async () => {
      await pushTelegramUpdate(
        server.url,
        token,
        { message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } },
        [{ file_id: 'f1', file_path: 'photos/f1.jpg', mime: 'image/jpeg', base64 }],
      );

      const getFileResponse = await fetch(`${server.url}/telegram/bot${token}/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: 'f1' }),
      });
      const getFileBody = (await getFileResponse.json()) as { result: { file_path: string; file_size: number } };
      expect(getFileBody.result.file_path).toBe('photos/f1.jpg');
      expect(getFileBody.result.file_size).toBe(Buffer.from(base64, 'base64').length);

      const downloadResponse = await fetch(`${server.url}/telegram/file/bot${token}/${getFileBody.result.file_path}`);
      expect(downloadResponse.status).toBe(200);
      expect(downloadResponse.headers.get('content-type')).toContain('image/jpeg');
      expect(await downloadResponse.text()).toBe('hello bytes');
    });

    it('getFile responds not-ok for an unknown file_id', async () => {
      const response = await fetch(`${server.url}/telegram/bot${token}/getFile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: 'missing' }),
      });
      expect(response.ok).toBe(false);
    });

    it('sendPhoto records the multipart call (chat_id/caption/filename) and returns a message_id', async () => {
      const form = new FormData();
      form.set('chat_id', '42');
      form.set('caption', 'a cat');
      form.set('photo', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'cat.png');

      const response = await fetch(`${server.url}/telegram/bot${token}/sendPhoto`, { method: 'POST', body: form });
      expect(response.ok).toBe(true);
      expect((await response.json()) as { result: { message_id: number } }).toEqual({
        ok: true,
        result: { message_id: expect.any(Number) },
      });

      const calls = await getTelegramCalls(server.url, token);
      const sendPhotoCall = calls.find((call) => call.method === 'sendPhoto');
      expect(sendPhotoCall?.body).toEqual({
        chat_id: '42',
        caption: 'a cat',
        field: 'photo',
        filename: 'cat.png',
        byteLength: 3,
      });
    });
  });

  describe('community management (ADR 0076 (private))', () => {
    const call = (token: string, method: string, body: unknown): Promise<Response> =>
      fetch(`${server.url}/telegram/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('passes chat_member / chat_join_request / service-message updates through getUpdates as they are', async () => {
      const token = 'c:1';
      const updates = [
        { chat_member: { chat: { id: -1, type: 'supergroup' }, new_chat_member: { status: 'member' } } },
        { chat_join_request: { chat: { id: -1, type: 'supergroup' }, from: { id: 5 } } },
        { my_chat_member: { chat: { id: -1, type: 'supergroup' } } },
        { message: { message_id: 1, new_chat_members: [{ id: 5 }], chat: { id: -1, type: 'supergroup' } } },
        { message: { message_id: 2, left_chat_member: { id: 5 }, chat: { id: -1, type: 'supergroup' } } },
      ];
      for (const update of updates) await pushTelegramUpdate(server.url, token, update as never);
      const polled = (await (await fetch(`${server.url}/telegram/bot${token}/getUpdates`)).json()) as {
        result: Record<string, unknown>[];
      };
      expect(polled.result.map(({ update_id: _id, ...rest }) => rest)).toEqual(updates);
    });

    it('records the allowed_updates of getUpdates (once per change) and of setWebhook', async () => {
      const token = 'c:2';
      const allowed = encodeURIComponent(JSON.stringify(['message', 'chat_member']));
      await fetch(`${server.url}/telegram/bot${token}/getUpdates?allowed_updates=${allowed}`);
      await fetch(`${server.url}/telegram/bot${token}/getUpdates?allowed_updates=${allowed}`);
      await call(token, 'setWebhook', { url: 'http://x', allowed_updates: ['message', 'chat_member'] });
      expect(await getTelegramCalls(server.url, token)).toEqual([
        { method: 'getUpdates', body: { allowed_updates: ['message', 'chat_member'] } },
        { method: 'setWebhook', body: { url: 'http://x', allowed_updates: ['message', 'chat_member'] } },
      ]);
    });

    it('tracks member status through ban / unban and answers getChatMember', async () => {
      const token = 'c:3';
      const status = async (): Promise<string> =>
        (
          (await (await call(token, 'getChatMember', { chat_id: -1, user_id: 7 })).json()) as {
            result: { status: string };
          }
        ).result.status;
      expect(await status()).toBe('member');
      await call(token, 'banChatMember', { chat_id: -1, user_id: 7 });
      expect(await status()).toBe('kicked');
      await call(token, 'unbanChatMember', { chat_id: -1, user_id: 7, only_if_banned: true });
      expect(await status()).toBe('left');
      const methods = (await getTelegramCalls(server.url, token)).map((recorded) => recorded.method);
      expect(methods).toEqual(['getChatMember', 'banChatMember', 'getChatMember', 'unbanChatMember', 'getChatMember']);
    });

    it('deleteMessage succeeds once, then answers 400 "message to delete not found"', async () => {
      const token = 'c:4';
      expect((await call(token, 'deleteMessage', { chat_id: -1, message_id: 9 })).status).toBe(200);
      const second = await call(token, 'deleteMessage', { chat_id: -1, message_id: 9 });
      expect(second.status).toBe(400);
      expect(((await second.json()) as { description: string }).description).toContain('message to delete not found');
    });

    it('records approve / decline join request calls', async () => {
      const token = 'c:5';
      expect((await call(token, 'approveChatJoinRequest', { chat_id: -1, user_id: 7 })).status).toBe(200);
      expect((await call(token, 'declineChatJoinRequest', { chat_id: -1, user_id: 8 })).status).toBe(200);
      expect((await getTelegramCalls(server.url, token)).map((recorded) => recorded.method)).toEqual([
        'approveChatJoinRequest',
        'declineChatJoinRequest',
      ]);
    });
  });
});
