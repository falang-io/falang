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
