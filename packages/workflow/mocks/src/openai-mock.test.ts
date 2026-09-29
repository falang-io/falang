import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getOpenAiRequests, queueOpenAiResponse, queueOpenAiToolCalls, resetOpenAiMock } from './client.js';
import { startTestServer, type ITestServer } from './test-server.js';

interface IChatCompletionResponse {
  readonly choices: readonly {
    readonly message: {
      readonly content: string | null;
      readonly tool_calls?: readonly { id: string; type: string; function: { name: string; arguments: string } }[];
    };
  }[];
}

const callChatCompletions = async (
  baseUrl: string,
  apiKey: string,
  messages: readonly { readonly role: string; readonly content: string }[],
): Promise<IChatCompletionResponse> => {
  const response = await fetch(`${baseUrl}/openai/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'mock-model', messages }),
  });
  return (await response.json()) as IChatCompletionResponse;
};

describe('openai mock', () => {
  // oxlint-disable-next-line init-declarations
  let server: ITestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET /openai/models returns a canned model list', async () => {
    const response = await fetch(`${server.url}/openai/models`);
    expect(await response.json()).toEqual({ data: [{ id: 'mock-model' }] });
  });

  it('returns queued scripted responses once each, in order', async () => {
    await queueOpenAiResponse(server.url, 'key-1', 'first');
    await queueOpenAiResponse(server.url, 'key-1', 'second');

    const first = await callChatCompletions(server.url, 'key-1', [{ role: 'user', content: 'hi' }]);
    expect(first.choices[0].message.content).toBe('first');

    const second = await callChatCompletions(server.url, 'key-1', [{ role: 'user', content: 'hi again' }]);
    expect(second.choices[0].message.content).toBe('second');
  });

  it('falls back to a deterministic default derived from the last user message when nothing is queued', async () => {
    const response = await callChatCompletions(server.url, 'key-2', [
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'hello there' },
    ]);
    expect(response.choices[0].message.content).toBe('mock-response-for: hello there');
  });

  it('partitions state per apiKey — a queued response for one key never leaks to another', async () => {
    await queueOpenAiResponse(server.url, 'key-3', 'only-for-key-3');
    const otherKeyResponse = await callChatCompletions(server.url, 'key-4', [{ role: 'user', content: 'x' }]);
    expect(otherKeyResponse.choices[0].message.content).toBe('mock-response-for: x');
  });

  it('returns a queued tool-calling turn — object arguments JSON-encoded, string arguments verbatim', async () => {
    await queueOpenAiToolCalls(server.url, 'key-7', [
      { id: 'c1', name: 'get_tree', arguments: { documentId: 'd1' } },
      { name: 'insert_node', arguments: '{"parentId":' },
    ]);
    await queueOpenAiResponse(server.url, 'key-7', 'after tools');

    const first = await callChatCompletions(server.url, 'key-7', [{ role: 'user', content: 'go' }]);
    expect(first.choices[0].message).toEqual({
      content: null,
      role: 'assistant',
      tool_calls: [
        { function: { arguments: '{"documentId":"d1"}', name: 'get_tree' }, id: 'c1', type: 'function' },
        { function: { arguments: '{"parentId":', name: 'insert_node' }, id: 'call-1-1', type: 'function' },
      ],
    });
    const second = await callChatCompletions(server.url, 'key-7', [{ role: 'user', content: 'go' }]);
    expect(second.choices[0].message).toEqual({ content: 'after tools', role: 'assistant' });
  });

  it('records every request body, inspectable via getOpenAiRequests', async () => {
    await callChatCompletions(server.url, 'key-5', [{ role: 'user', content: 'record me' }]);
    const requests = await getOpenAiRequests(server.url, 'key-5');
    expect(requests).toEqual([{ model: 'mock-model', messages: [{ role: 'user', content: 'record me' }] }]);
  });

  it('reset clears queued responses and recorded requests for that apiKey', async () => {
    await queueOpenAiResponse(server.url, 'key-6', 'queued');
    await callChatCompletions(server.url, 'key-6', [{ role: 'user', content: 'x' }]);
    expect(await getOpenAiRequests(server.url, 'key-6')).toHaveLength(1);

    await resetOpenAiMock(server.url, 'key-6');

    expect(await getOpenAiRequests(server.url, 'key-6')).toEqual([]);
    const afterReset = await callChatCompletions(server.url, 'key-6', [{ role: 'user', content: 'y' }]);
    expect(afterReset.choices[0].message.content).toBe('mock-response-for: y');
  });

  it('POST /openai/chat/completions records a content array (attachments) exactly as sent', async () => {
    const parts = [
      { text: 'describe this', type: 'text' },
      { image_url: { url: 'data:image/png;base64,AA==' }, type: 'image_url' },
    ];
    await fetch(`${server.url}/openai/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer key-10' },
      body: JSON.stringify({ model: 'mock-model', messages: [{ content: parts, role: 'user' }] }),
    });
    const requests = await getOpenAiRequests(server.url, 'key-10');
    expect(requests).toEqual([{ model: 'mock-model', messages: [{ content: parts, role: 'user' }] }]);
  });

  it('POST /openai/images/generations returns a canned base64 PNG and records the request tagged kind: image', async () => {
    const response = await fetch(`${server.url}/openai/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer key-8' },
      body: JSON.stringify({ model: 'mock-image-model', prompt: 'a cat', size: '1024x1024' }),
    });
    const body = (await response.json()) as { data: { b64_json: string }[] };
    expect(body.data[0].b64_json).toBeTruthy();
    expect(Buffer.from(body.data[0].b64_json, 'base64').length).toBeGreaterThan(0);

    const requests = await getOpenAiRequests(server.url, 'key-8');
    expect(requests).toEqual([{ kind: 'image', model: 'mock-image-model', prompt: 'a cat', size: '1024x1024' }]);
  });

  it('POST /openai/audio/transcriptions parses the multipart body and records content-type/size/filename', async () => {
    const form = new FormData();
    form.append('model', 'whisper-1');
    form.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }), 'voice.mp3');

    const response = await fetch(`${server.url}/openai/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer key-9' },
      body: form,
    });
    const body = (await response.json()) as { text: string };
    expect(body.text).toBe('transcribed: voice.mp3');

    const requests = await getOpenAiRequests(server.url, 'key-9');
    expect(requests).toEqual([
      {
        kind: 'transcription',
        contentType: expect.stringContaining('multipart/form-data'),
        filename: 'voice.mp3',
        size: expect.any(Number),
      },
    ]);
  });
});
