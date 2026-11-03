/* oxlint-disable unicorn/no-await-expression-member -- compact response assertions */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getVkCalls, pushVkUpdate, resetVkMock } from './client.js';
import { startTestServer, type ITestServer } from './test-server.js';
import { VK_MOCK_BASE_PLACEHOLDER, resetAllVkMockState } from './vk-mock.js';

const TOKEN = 'vk-token-1';

interface IVkAnswer<T> {
  response?: T;
  error?: { error_code: number; error_msg: string };
}

/** One call the way the VK activities make it: Bearer token, form-urlencoded body. */
const api = async <T>(baseUrl: string, method: string, params: Record<string, string> = {}): Promise<IVkAnswer<T>> => {
  const response = await fetch(`${baseUrl}/vk/method/${method}?v=5.199`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  return (await response.json()) as IVkAnswer<T>;
};

const multipart = (field: string, filename: string, content: string): { body: string; contentType: string } => {
  const boundary = 'xBOUNDARYx';
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  };
};

describe('vk mock', () => {
  // oxlint-disable-next-line init-declarations
  let server: ITestServer;

  beforeEach(async () => {
    resetAllVkMockState();
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('answers a missing token and an unknown method with VK errors over HTTP 200', async () => {
    const noToken = await fetch(`${server.url}/vk/method/groups.getById`);
    expect(noToken.status).toBe(200);
    expect(((await noToken.json()) as IVkAnswer<unknown>).error?.error_code).toBe(5);
    expect((await api(server.url, 'nope.nope')).error?.error_code).toBe(3);
  });

  it('accepts access_token in the query and returns a stable community', async () => {
    const url = `${server.url}/vk/method/groups.getById?access_token=${TOKEN}`;
    const first = (await (await fetch(url)).json()) as IVkAnswer<{ groups: { id: number; screen_name: string }[] }>;
    const second = await api<{ groups: { id: number }[] }>(server.url, 'groups.getById');
    expect(first.response?.groups[0].id).toBe(second.response?.groups[0].id);
    expect(first.response?.groups[0].screen_name).toBe(`mock_community_${first.response?.groups[0].id}`);
  });

  it('sends with peer_id (number) and peer_ids (array with cmid), counting cmids per peer', async () => {
    const single = await api<number>(server.url, 'messages.send', { peer_id: '7', message: 'hi', random_id: '1' });
    expect(typeof single.response).toBe('number');
    const multi = await api<{ peer_id: number; message_id: number; conversation_message_id: number }[]>(
      server.url,
      'messages.send',
      { peer_ids: '7', message: 'again', random_id: '2' },
    );
    expect(multi.response?.[0]).toMatchObject({ peer_id: 7, conversation_message_id: 2 });
    expect(multi.response?.[0].message_id).not.toBe(single.response);
    const calls = await getVkCalls(server.url, TOKEN);
    expect(calls[0]).toMatchObject({ method: 'messages.send', messageId: single.response, conversationMessageId: 1 });
    expect(calls[0].params).not.toHaveProperty('access_token');
  });

  it('edits a message and reads it back by conversation message id', async () => {
    await api(server.url, 'messages.send', {
      peer_ids: '5',
      message: 'Continue?',
      keyboard: '{"buttons":[[]],"inline":true}',
      random_id: '1',
    });
    const edited = await api(server.url, 'messages.edit', {
      peer_id: '5',
      conversation_message_id: '1',
      message: 'Continue?',
      keyboard: '{"buttons":[],"inline":true}',
    });
    expect(edited.response).toBe(1);
    const read = await api<{ count: number; items: { text: string; keyboard: { buttons: unknown[] } }[] }>(
      server.url,
      'messages.getByConversationMessageId',
      { peer_id: '5', conversation_message_ids: '1' },
    );
    expect(read.response?.count).toBe(1);
    expect(read.response?.items[0]).toMatchObject({ text: 'Continue?', keyboard: { buttons: [] } });
    expect(
      (await api(server.url, 'messages.edit', { peer_id: '5', message_id: '999999', message: 'x' })).error?.error_code,
    ).toBe(100);
  });

  it('serves users.get and acknowledges callback/activity methods', async () => {
    const users = await api<{ id: number; first_name: string; last_name: string }[]>(server.url, 'users.get', {
      user_ids: '11,12',
    });
    expect(users.response).toEqual([
      { id: 11, first_name: 'User', last_name: '11' },
      { id: 12, first_name: 'User', last_name: '12' },
    ]);
    const added = await api<{ server_id: number }>(server.url, 'groups.addCallbackServer', {
      url: 'http://x/y',
      title: 'Falang',
      secret_key: 's',
    });
    const list = await api<{ count: number }>(server.url, 'groups.getCallbackServers');
    expect(list.response?.count).toBe(1);
    await api(server.url, 'groups.deleteCallbackServer', { server_id: String(added.response?.server_id) });
    expect((await api<{ count: number }>(server.url, 'groups.getCallbackServers')).response?.count).toBe(0);
    expect((await api(server.url, 'messages.setActivity', { peer_id: '1', type: 'typing' })).response).toBe(1);
  });

  it('long poll: delivers updates with event ids, waits when empty, fails on a wrong key', async () => {
    const lp = await api<{ server: string; key: string; ts: string }>(server.url, 'groups.getLongPollServer');
    const poll = async (
      key = lp.response?.key ?? '',
      wait = 1,
    ): Promise<{ ts?: string; updates?: Record<string, unknown>[]; failed?: number }> =>
      (await (await fetch(`${lp.response?.server}?act=a_check&key=${key}&ts=1&wait=${wait}`)).json()) as never;

    const started = Date.now();
    expect((await poll()).updates).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);

    await pushVkUpdate(server.url, TOKEN, [
      { type: 'message_new', object: { message: { text: 'hello', peer_id: 7 } } },
    ]);
    const answer = await poll();
    expect(answer.updates).toHaveLength(1);
    expect(answer.updates?.[0]).toMatchObject({
      type: 'message_new',
      v: '5.199',
      group_id: expect.any(Number),
      event_id: expect.any(String),
    });
    expect((await poll()).updates).toEqual([]);
    expect(await poll('wrong')).toEqual({ failed: 2 });
    expect((await getVkCalls(server.url, TOKEN)).map((c) => c.method)).not.toContain('groups.getLongPollServer');
  });

  it('uploads a photo and a document through the signed-less upload url', async () => {
    const photoServer = await api<{ upload_url: string }>(server.url, 'photos.getMessagesUploadServer', {
      peer_id: '7',
    });
    const photoBody = multipart('photo', 'a.png', 'PNGDATA');
    const uploadedPhoto = (await (
      await fetch(photoServer.response?.upload_url ?? '', {
        method: 'POST',
        headers: { 'Content-Type': photoBody.contentType },
        body: photoBody.body,
      })
    ).json()) as { server: number; photo: string; hash: string };
    expect(uploadedPhoto).toMatchObject({
      server: expect.any(Number),
      photo: expect.any(String),
      hash: expect.any(String),
    });
    const saved = await api<{ id: number; owner_id: number; access_key: string }[]>(
      server.url,
      'photos.saveMessagesPhoto',
      {
        photo: uploadedPhoto.photo,
        server: String(uploadedPhoto.server),
        hash: uploadedPhoto.hash,
      },
    );
    expect(saved.response?.[0]).toMatchObject({
      id: expect.any(Number),
      owner_id: expect.any(Number),
      access_key: expect.any(String),
    });

    const docServer = await api<{ upload_url: string }>(server.url, 'docs.getMessagesUploadServer', {
      type: 'doc',
      peer_id: '7',
    });
    const docBody = multipart('file', 'r.txt', 'hello');
    const uploadedDoc = (await (
      await fetch(docServer.response?.upload_url ?? '', {
        method: 'POST',
        headers: { 'Content-Type': docBody.contentType },
        body: docBody.body,
      })
    ).json()) as { file: string };
    const doc = await api<{ type: string; doc: { id: number; owner_id: number } }>(server.url, 'docs.save', {
      file: uploadedDoc.file,
      title: 'r.txt',
    });
    expect(doc.response).toMatchObject({ type: 'doc', doc: { id: expect.any(Number), owner_id: expect.any(Number) } });

    const uploads = (await getVkCalls(server.url, TOKEN)).filter((c) => c.method === 'upload');
    expect(uploads.map((c) => c.upload)).toEqual([
      { kind: 'photo', field: 'photo', filename: 'a.png', byteLength: 7 },
      { kind: 'doc', field: 'file', filename: 'r.txt', byteLength: 5 },
    ]);
  });

  it('serves seeded files and substitutes the base placeholder in delivered updates', async () => {
    await pushVkUpdate(
      server.url,
      TOKEN,
      [{ type: 'message_new', object: { url: `${VK_MOCK_BASE_PLACEHOLDER}/files/${TOKEN}/dir/p.jpg` } }],
      [{ path: 'dir/p.jpg', mime: 'image/jpeg', base64: Buffer.from('JPEG').toString('base64') }],
    );
    const lp = await api<{ server: string; key: string }>(server.url, 'groups.getLongPollServer');
    const answer = (await (
      await fetch(`${lp.response?.server}?act=a_check&key=${lp.response?.key}&ts=1&wait=0`)
    ).json()) as {
      updates: { object: { url: string } }[];
    };
    const { url } = answer.updates[0].object;
    expect(url).toBe(`${server.url}/vk/files/${TOKEN}/dir/p.jpg`);
    const file = await fetch(url);
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    expect(await file.text()).toBe('JPEG');
    expect((await fetch(`${server.url}/vk/files/${TOKEN}/missing`)).status).toBe(404);
  });

  it('resets per token and through the global reset hook', async () => {
    await api(server.url, 'messages.send', { peer_id: '1', message: 'x', random_id: '1' });
    expect(await getVkCalls(server.url, TOKEN)).toHaveLength(1);
    await resetVkMock(server.url, TOKEN);
    expect(await getVkCalls(server.url, TOKEN)).toHaveLength(0);
    await api(server.url, 'messages.send', { peer_id: '1', message: 'x', random_id: '1' });
    await fetch(`${server.url}/__mock__/reset`, { method: 'POST' });
    expect(await getVkCalls(server.url, TOKEN)).toHaveLength(0);
  });
});
