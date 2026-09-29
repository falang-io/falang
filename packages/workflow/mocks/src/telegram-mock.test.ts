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
    const routes = ['editMessageReplyMarkup', 'answerCallbackQuery', 'setWebhook', 'deleteWebhook'];
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
});
