import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callOpenAiChat } from './openai-chat-client.js';

const jsonResponse = (body: unknown): Response => Response.json(body);

describe('callOpenAiChat — cached prompt tokens', () => {
  let fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['OpenAI prompt_tokens_details.cached_tokens', { prompt_tokens_details: { cached_tokens: 6 } }, 6],
    ["DeepSeek's prompt_cache_hit_tokens", { prompt_cache_hit_tokens: 7 }, 7],
    ['a value above prompt_tokens, clamped', { prompt_tokens_details: { cached_tokens: 99 } }, 10],
  ])('reports cached prompt tokens from %s', async (_label, extra, expected) => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'hi', tool_calls: [] } }],
        usage: { completion_tokens: 4, prompt_tokens: 10, total_tokens: 14, ...extra },
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
    expect(result.usage?.cachedPromptTokens).toBe(expected);
  });

  it('omits cachedPromptTokens when the vendor reports no cache', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'hi', tool_calls: [] } }],
        usage: { completion_tokens: 4, prompt_tokens: 10, prompt_tokens_details: null, total_tokens: 14 },
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
    expect(result.usage && 'cachedPromptTokens' in result.usage).toBe(false);
  });
});
