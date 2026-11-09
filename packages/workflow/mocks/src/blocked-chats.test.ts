import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetAllBlockedChats } from './blocked-chats.js';
import { setBlockedChats } from './client.js';
import { startTestServer, type ITestServer } from './test-server.js';

const post = (url: string, init: { headers?: Record<string, string>; body: string }): Promise<Response> =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...init.headers }, body: init.body });

describe('blocked chats in the messenger mocks', () => {
  // oxlint-disable-next-line init-declarations
  let server: ITestServer;

  beforeEach(async () => {
    resetAllBlockedChats();
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('Telegram answers 403 "bot was blocked by the user" for a blocked chat only', async () => {
    await setBlockedChats(server.url, 'telegram', 'tg', [666]);
    const blocked = await post(`${server.url}/telegram/bottg/sendMessage`, {
      body: JSON.stringify({ chat_id: 666, text: 'hi' }),
    });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ description: 'Forbidden: bot was blocked by the user' });
    const open = await post(`${server.url}/telegram/bottg/sendMessage`, {
      body: JSON.stringify({ chat_id: 7, text: 'hi' }),
    });
    expect(open.status).toBe(200);
  });

  it('MAX answers with an error whose text says "suspended", by chat or by user', async () => {
    await setBlockedChats(server.url, 'max', 'mx', [666]);
    const send = (query: string): Promise<Response> =>
      post(`${server.url}/max/messages?${query}`, {
        headers: { Authorization: 'mx' },
        body: JSON.stringify({ text: 'hi' }),
      });
    const responses = await Promise.all([send('chat_id=666'), send('user_id=666')]);
    expect(responses.map((response) => response.status)).toEqual([403, 403]);
    const texts = await Promise.all(responses.map((response) => response.text()));
    expect(texts.every((text) => text.includes('suspended'))).toBe(true);
  });

  it('VK answers error 901 for a blocked peer', async () => {
    await setBlockedChats(server.url, 'vk', 'vk-token', [666]);
    const response = await fetch(`${server.url}/vk/method/messages.send?v=5.199`, {
      method: 'POST',
      headers: { Authorization: 'Bearer vk-token', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ peer_id: '666', random_id: '1', message: 'hi' }).toString(),
    });
    expect(await response.json()).toMatchObject({ error: { error_code: 901 } });
  });

  it('the service-wide reset forgets every blocked chat', async () => {
    await setBlockedChats(server.url, 'telegram', 'tg', [666]);
    await fetch(`${server.url}/__mock__/reset`, { method: 'POST' });
    const response = await post(`${server.url}/telegram/bottg/sendMessage`, {
      body: JSON.stringify({ chat_id: 666, text: 'hi' }),
    });
    expect(response.status).toBe(200);
  });
});
