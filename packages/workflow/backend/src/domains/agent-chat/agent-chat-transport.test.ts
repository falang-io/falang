import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChatVendorError, postJsonWithRetries } from './agent-chat-transport.js';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  Response.json(body, { headers, status });

const terminated = (): TypeError =>
  new TypeError('terminated', { cause: Object.assign(new Error('read ETIMEDOUT'), { code: 'ETIMEDOUT' }) });

describe('postJsonWithRetries', () => {
  let fetchMock = vi.fn();
  let sleep = vi.fn();
  const post = (maxRetries = 3) =>
    postJsonWithRetries(
      'https://vendor.test/v1/chat/completions',
      { body: '{}', headers: {} },
      { maxRetries, sleep, timeoutMs: 1000 },
    );

  beforeEach(() => {
    fetchMock = vi.fn();
    sleep = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries a dropped connection (terminated / ETIMEDOUT) and returns the eventual response', async () => {
    fetchMock.mockRejectedValueOnce(terminated()).mockResolvedValueOnce(jsonResponse({ ok: 1 }));

    await expect(post()).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('retries 429/5xx with exponential backoff, honoring Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'Retry-After': '7' }))
      .mockResolvedValueOnce(jsonResponse({ ok: 2 }));

    await expect(post()).resolves.toEqual({ ok: 2 });
    expect(sleep.mock.calls).toEqual([[1000], [7000]]);
  });

  it('gives up after maxRetries + 1 attempts with a descriptive AgentChatVendorError', async () => {
    fetchMock.mockRejectedValue(terminated());

    const thrown = await post(3).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(AgentChatVendorError);
    expect((thrown as Error).message).toBe(
      'AI vendor request failed after 4 attempts: terminated: read ETIMEDOUT (ETIMEDOUT)',
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[1000], [2000], [4000]]);
  });

  it('does not retry a non-retryable 4xx', async () => {
    fetchMock.mockResolvedValue(new Response('invalid api key', { status: 401 }));

    await expect(post()).rejects.toThrow('OpenAI chat completion failed: 401 invalid api key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries when the body cannot be read to the end', async () => {
    const broken = new Response('{"a":', { headers: { 'Content-Type': 'application/json' }, status: 200 });
    fetchMock.mockResolvedValueOnce(broken).mockResolvedValueOnce(jsonResponse({ ok: 3 }));

    await expect(post()).resolves.toEqual({ ok: 3 });
  });
});
