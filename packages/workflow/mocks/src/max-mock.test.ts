import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMaxCalls, pushMaxUpdate, resetMaxMock } from './client.js';
import { MAX_MOCK_BASE_PLACEHOLDER } from './max-mock.js';
import { startTestServer, type ITestServer } from './test-server.js';

const TOKEN = 'max-token-1';

/** One call the way the MAX activities make it: the token in `Authorization`, an optional JSON body. */
const api = async <T>(baseUrl: string, method: string, path: string, body: object | null = null): Promise<T> => {
  const init: RequestInit =
    body === null
      ? { method, headers: { Authorization: TOKEN } }
      : { method, headers: { Authorization: TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const response = await fetch(`${baseUrl}/max/${path}`, init);
  return (await response.json()) as T;
};

describe('max mock', () => {
  // oxlint-disable-next-line init-declarations
  let server: ITestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('rejects calls without the token header like real Max', async () => {
    const response = await fetch(`${server.url}/max/updates`);
    expect(response.status).toBe(401);
  });

  it('answers GET /me with the bot identity and requires the token', async () => {
    const me = await api<{ username: string; is_bot: boolean }>(server.url, 'GET', 'me');
    expect(me).toMatchObject({ username: 'mock_max_test_bot', is_bot: true });
    const unauthenticated = await fetch(`${server.url}/max/me`);
    expect(unauthenticated.status).toBe(401);
  });

  it('records sent messages, serves them back by mid and records edits', async () => {
    const sent = await api<{ message: { body: { mid: string } } }>(server.url, 'POST', 'messages?chat_id=42', {
      text: 'Continue?',
      attachments: [],
    });
    const mid = sent.message.body.mid;
    expect(mid).toMatch(/^mid\.[0-9a-f]+\.1$/);

    const fetched = await api<{ body: { text: string } }>(server.url, 'GET', `messages/${mid}`);
    expect(fetched.body.text).toBe('Continue?');

    await api(server.url, 'PUT', `messages?message_id=${mid}`, { text: 'Continue?', attachments: [] });
    const calls = await getMaxCalls(server.url, TOKEN);
    expect(calls.map((call) => [call.method, call.query])).toEqual([
      ['sendMessage', { chat_id: '42' }],
      ['getMessage', { message_id: mid }],
      ['editMessage', { message_id: mid }],
    ]);
  });

  it('hands queued updates to the next poll with the placeholder replaced by its own address', async () => {
    await pushMaxUpdate(
      server.url,
      TOKEN,
      {
        update_type: 'message_created',
        message: {
          body: {
            mid: 'in.1',
            attachments: [{ type: 'image', payload: { url: `${MAX_MOCK_BASE_PLACEHOLDER}/files/${TOKEN}/a.png` } }],
          },
        },
      },
      [{ path: 'a.png', mime: 'image/png', base64: Buffer.from('png').toString('base64') }],
    );
    const poll = await api<{
      updates: { message: { body: { attachments: { payload: { url: string } }[] } } }[];
      marker: number;
    }>(server.url, 'GET', 'updates');
    expect(poll.marker).toBe(1);
    const [update] = poll.updates;
    const { url } = update.message.body.attachments[0].payload;
    expect(url).toBe(`${server.url}/max/files/${TOKEN}/a.png`);
    const download = await fetch(url);
    expect(download.headers.get('content-type')).toBe('image/png');
    expect(await download.text()).toBe('png');

    const empty = await api<{ updates: unknown[]; marker: number }>(server.url, 'GET', 'updates');
    expect(empty).toEqual({ updates: [], marker: 2 });
  });

  it('runs the three-step file upload and returns what each attachment type needs', async () => {
    const image = await api<{ url: string; token?: string }>(server.url, 'POST', 'uploads?type=image');
    expect(image.token).toBeUndefined();
    const form = new FormData();
    form.set('data', new Blob([Buffer.from('bytes')]), 'cat.png');
    const uploadResponse = await fetch(image.url, { method: 'POST', body: form });
    expect(await uploadResponse.json()).toEqual({ photos: { p1: { token: 'image-token-1' } } });

    const video = await api<{ token?: string }>(server.url, 'POST', 'uploads?type=video');
    expect(video.token).toBe('video-token-2');

    const calls = await getMaxCalls(server.url, TOKEN);
    expect(calls.find((call) => call.method === 'upload')?.body).toEqual({
      field: 'data',
      filename: 'cat.png',
      byteLength: 5,
    });
  });

  it('keeps webhook subscriptions until they are deleted, and resets per token', async () => {
    await api(server.url, 'POST', 'subscriptions', { url: 'https://hook', update_types: ['message_created'] });
    const listed = await api<{ subscriptions: { url: string }[] }>(server.url, 'GET', 'subscriptions');
    expect(listed.subscriptions.map((sub) => sub.url)).toEqual(['https://hook']);
    await api(server.url, 'DELETE', 'subscriptions?url=https%3A%2F%2Fhook');
    const after = await api<{ subscriptions: unknown[] }>(server.url, 'GET', 'subscriptions');
    expect(after.subscriptions).toEqual([]);

    await resetMaxMock(server.url, TOKEN);
    expect(await getMaxCalls(server.url, TOKEN)).toEqual([]);
  });
});
