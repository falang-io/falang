import { describe, expect, it, vi } from 'vitest';
import { fetchOpenAiModelOptions } from './list-models.js';

describe('fetchOpenAiModelOptions egress guard (SSRF, security audit P0-11)', () => {
  it('goes through the backend egress guard when one is provided, never the global fetch', async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const guardedFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [{ id: 'm' }] }) });
    try {
      const options = await fetchOpenAiModelOptions(
        { baseUrl: 'http://169.254.169.254/latest', apiKey: 'k' },
        { fetch: guardedFetch, resolveHost: vi.fn() },
      );
      expect(options).toEqual([{ value: 'm', label: 'm' }]);
      expect(guardedFetch).toHaveBeenCalledWith('http://169.254.169.254/latest/models', expect.anything());
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces a guard rejection', async () => {
    const guardedFetch = vi.fn().mockRejectedValue(new Error('blocked'));
    await expect(
      fetchOpenAiModelOptions(
        { baseUrl: 'http://10.0.0.1', apiKey: 'k' },
        { fetch: guardedFetch, resolveHost: vi.fn() },
      ),
    ).rejects.toThrow('blocked');
  });
});
