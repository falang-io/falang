import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callOpenAiChat } from './openai-chat-client.js';

const jsonResponse = (body: unknown): Response => Response.json(body);

describe('callOpenAiChat', () => {
  let fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends system + user messages and no tools field when tools is empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hi', tool_calls: [] } }] }));

    const result = await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [{ content: 'hello', role: 'user' }],
      model: 'gpt-test',
      system: 'be nice',
      tools: [],
    });

    expect(result).toEqual({ text: 'hi', toolCalls: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer key' });
    const body = JSON.parse(init.body as string) as { messages: unknown[]; tools?: unknown };
    expect(body.messages).toEqual([
      { content: 'be nice', role: 'system' },
      { content: 'hello', role: 'user' },
    ]);
    expect(body.tools).toBeUndefined();
  });

  it('encodes tool definitions as OpenAI function tools', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '', tool_calls: [] } }] }));

    await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [],
      model: 'gpt-test',
      system: 's',
      tools: [{ description: 'inserts a node', inputSchema: { type: 'object' }, name: 'insert_node' }],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { tools: unknown[] };
    expect(body.tools).toEqual([
      {
        function: { description: 'inserts a node', name: 'insert_node', parameters: { type: 'object' } },
        type: 'function',
      },
    ]);
  });

  it('encodes an assistant message with tool calls and a following tool message per result', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '', tool_calls: [] } }] }));

    await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [
        {
          content: '',
          role: 'assistant',
          toolCalls: [{ id: 'call-1', input: { id: 'n1' }, name: 'delete_node' }],
        },
        {
          role: 'tool',
          results: [{ content: '{"deleted":"n1"}', isError: false, toolCallId: 'call-1' }],
        },
      ],
      model: 'gpt-test',
      system: 's',
      tools: [],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { messages: unknown[] };
    expect(body.messages).toEqual([
      { content: 's', role: 'system' },
      {
        content: null,
        role: 'assistant',
        tool_calls: [{ function: { arguments: '{"id":"n1"}', name: 'delete_node' }, id: 'call-1', type: 'function' }],
      },
      { content: '{"deleted":"n1"}', role: 'tool', tool_call_id: 'call-1' },
    ]);
  });

  it('parses tool_calls from the response into the abstract ILlmToolCall shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: { arguments: '{"parentId":"2","index":0,"name":"action"}', name: 'insert_node' },
                  id: 'c1',
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [],
      model: 'gpt-test',
      system: 's',
      tools: [],
    });

    expect(result).toEqual({
      text: '',
      toolCalls: [{ id: 'c1', input: { index: 0, name: 'action', parentId: '2' }, name: 'insert_node' }],
    });
  });

  it('falls back to an empty object plus an inputError when tool call arguments are not valid JSON', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: { content: null, tool_calls: [{ function: { arguments: 'not json', name: 'finish' }, id: 'c1' }] },
          },
        ],
      }),
    );

    const result = await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [],
      model: 'gpt-test',
      system: 's',
      tools: [],
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ id: 'c1', input: {}, name: 'finish' });
    expect(result.toolCalls[0]?.inputError).toMatch(/^The tool call's arguments were not valid JSON \(.+\): not json$/);
  });

  it('truncates long unparseable arguments in inputError', async () => {
    const raw = `{"parentId":"2","node":{"name":"action","data":"${'x'.repeat(500)}"`;
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: { content: null, tool_calls: [{ function: { arguments: raw, name: 'insert_nodes' }, id: 'c1' }] },
          },
        ],
      }),
    );

    const result = await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [],
      model: 'gpt-test',
      system: 's',
      tools: [],
    });

    expect(result.toolCalls[0]?.inputError).toContain(`… (${raw.length} chars)`);
    expect(result.toolCalls[0]?.inputError?.length).toBeLessThan(400);
  });

  it('returns the vendor usage when present', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'hi', tool_calls: [] } }],
        usage: { completion_tokens: 4, prompt_tokens: 10, total_tokens: 14 },
      }),
    );
    const result = await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [{ content: 'hello', role: 'user' }],
      model: 'gpt-test',
      system: 's',
      tools: [],
    });
    expect(result.usage).toEqual({ completionTokens: 4, promptTokens: 10, totalTokens: 14 });
  });

  it('omits usage when the vendor sends none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hi', tool_calls: [] } }] }));
    const result = await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [{ content: 'hello', role: 'user' }],
      model: 'gpt-test',
      system: 's',
      tools: [],
    });
    expect('usage' in result).toBe(false);
  });

  it('derives totalTokens when the vendor omits it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'hi', tool_calls: [] } }],
        usage: { completion_tokens: 4, prompt_tokens: 10 },
      }),
    );
    const result = await callOpenAiChat({
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [{ content: 'hello', role: 'user' }],
      model: 'gpt-test',
      system: 's',
      tools: [],
    });
    expect(result.usage?.totalTokens).toBe(14);
  });

  it('throws with the response body when the request fails', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));

    await expect(
      callOpenAiChat({
        apiKey: 'key',
        baseUrl: 'https://api.example.com',
        messages: [],
        model: 'gpt-test',
        system: 's',
        tools: [],
      }),
    ).rejects.toThrow(/OpenAI chat completion failed: 400/);
  });

  describe('extraBody', () => {
    const baseParams = {
      apiKey: 'key',
      baseUrl: 'https://api.example.com',
      messages: [{ content: 'hello', role: 'user' as const }],
      model: 'gpt-test',
      system: 's',
      tools: [],
    };
    const sentBody = (): Record<string, unknown> => {
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      return JSON.parse(init.body as string) as Record<string, unknown>;
    };

    it('merges sampling/provider params into the request body', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hi' } }] }));
      await callOpenAiChat({ ...baseParams, extraBody: { reasoning: { effort: 'low' }, seed: 7, temperature: 0 } });
      expect(sentBody()).toMatchObject({ model: 'gpt-test', reasoning: { effort: 'low' }, seed: 7, temperature: 0 });
    });

    it('never lets extraBody override core fields', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hi' } }] }));
      await callOpenAiChat({
        ...baseParams,
        extraBody: { messages: ['evil'], model: 'other-model', temperature: 1, tools: ['evil'] },
      });
      const body = sentBody();
      expect(body.model).toBe('gpt-test');
      expect(body.messages).toEqual([
        { content: 's', role: 'system' },
        { content: 'hello', role: 'user' },
      ]);
      expect(body.tools).toBeUndefined();
      expect(body.temperature).toBe(1);
    });

    it('sends a byte-identical body when extraBody is absent or empty', async () => {
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ choices: [{ message: { content: 'hi' } }] })));
      await callOpenAiChat(baseParams);
      await callOpenAiChat({ ...baseParams, extraBody: {} });
      const bodies = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).body);
      expect(bodies[0]).toBe(bodies[1]);
      expect(Object.keys(JSON.parse(bodies[0] as string) as object)).toEqual(['messages', 'model']);
    });
  });
});
