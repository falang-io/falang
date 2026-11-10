import type { IBackendEgress } from '@falang/workflow-integrations-common';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AiProviderSettingsService, normalizeAiProviderBaseUrl } from './ai-provider-settings.service.js';
import type { AppSettingsService } from './app-settings.service.js';

/** In-memory `AppSettingsService`: secrets are stored as `enc:<value>` so a plain `get` never sees the key. */
const createSettings = (): { service: AiProviderSettingsService; store: Map<string, string> } => {
  const store = new Map<string, string>();
  const updated = new Map<string, Date>();
  const fake = {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    getSecret: (key: string) => Promise.resolve(store.get(key)?.replace(/^enc:/u, '') ?? null),
    getUpdatedAt: (key: string) => Promise.resolve(updated.get(key) ?? null),
    remove: (key: string) => {
      store.delete(key);
      updated.delete(key);
      return Promise.resolve();
    },
    set: (key: string, value: string) => {
      store.set(key, value);
      updated.set(key, new Date());
      return Promise.resolve();
    },
    setSecret: (key: string, value: string) => {
      store.set(key, `enc:${value}`);
      updated.set(key, new Date());
      return Promise.resolve();
    },
  };
  return { service: new AiProviderSettingsService(fake as unknown as AppSettingsService), store };
};

const MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
  { id: 'dall-e-3', kind: 'image' },
];

describe('normalizeAiProviderBaseUrl', () => {
  it('keeps the path and drops trailing slashes', () => {
    expect(normalizeAiProviderBaseUrl(' https://api.example.com/v1/ ')).toBe('https://api.example.com/v1');
    expect(normalizeAiProviderBaseUrl('http://host:8080')).toBe('http://host:8080');
  });

  it('refuses other schemes, queries and credentials', () => {
    expect(() => normalizeAiProviderBaseUrl('ftp://x')).toThrow(BadRequestException);
    expect(() => normalizeAiProviderBaseUrl('https://x/v1?a=1')).toThrow(BadRequestException);
    expect(() => normalizeAiProviderBaseUrl('https://u:p@x')).toThrow(BadRequestException);
    expect(() => normalizeAiProviderBaseUrl('not a url')).toThrow(BadRequestException);
  });
});

describe('AiProviderSettingsService', () => {
  it('is unconfigured and resolves to null at first', async () => {
    const { service } = createSettings();
    expect(await service.getStatus()).toEqual({
      baseUrl: null,
      configured: false,
      hasApiKey: false,
      models: [],
      updatedAt: null,
    });
    expect(await service.resolve()).toBeNull();
    expect(await service.getPublicStatus()).toEqual({ configured: false, models: [] });
  });

  it('requires a key the first time, then keeps the stored one when omitted', async () => {
    const { service, store } = createSettings();
    await expect(service.upsert({ baseUrl: 'https://p.example/v1', models: MODELS })).rejects.toThrow(
      BadRequestException,
    );
    await service.upsert({ apiKey: 'sk-1', baseUrl: 'https://p.example/v1/', models: MODELS });
    await service.upsert({ apiKey: '', baseUrl: 'https://p.example/v2', models: MODELS });
    expect(store.get('aiProvider.apiKey')).toBe('enc:sk-1');
    expect(await service.resolve()).toEqual({
      apiKey: 'sk-1',
      baseUrl: 'https://p.example/v2',
      models: [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
        { id: 'dall-e-3', kind: 'image' },
      ],
    });
    expect(await service.getPublicStatus()).toEqual({
      configured: true,
      models: [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
        { id: 'dall-e-3', label: 'dall-e-3', kind: 'image' },
      ],
    });
  });

  it('is not configured without a chat model', async () => {
    const { service } = createSettings();
    const status = await service.upsert({
      apiKey: 'k',
      baseUrl: 'https://p',
      models: [{ id: 'dall-e-3', kind: 'image' }],
    });
    expect(status.configured).toBe(false);
    expect(await service.resolve()).toBeNull();
    expect(await service.getPublicStatus()).toEqual({ configured: false, models: [] });
  });

  it('rejects invalid models with the list of problems and writes nothing', async () => {
    const { service, store } = createSettings();
    const attempt = service.upsert({ apiKey: 'k', baseUrl: 'https://p', models: [{ id: '', kind: 'chat' }] });
    await expect(attempt).rejects.toMatchObject({
      response: { errors: ['models[0].id: must be a non-empty string'] },
    });
    expect(store.size).toBe(0);
  });

  it('remove clears everything', async () => {
    const { service, store } = createSettings();
    await service.upsert({ apiKey: 'k', baseUrl: 'https://p', models: MODELS });
    await service.remove();
    expect(store.size).toBe(0);
  });

  describe('listUpstreamModels', () => {
    const egressAnswering = (response: Response): { egress: IBackendEgress; fetch: ReturnType<typeof vi.fn> } => {
      const fetch = vi.fn().mockResolvedValue(response);
      return { egress: { fetch, resolveHost: (host) => Promise.resolve(host) }, fetch };
    };

    it('uses the stored endpoint and key, deduplicates ids', async () => {
      const { service } = createSettings();
      await service.upsert({ apiKey: 'sk-stored', baseUrl: 'https://p.example/v1', models: MODELS });
      const { egress, fetch } = egressAnswering(
        Response.json({ data: [{ id: 'a', owned_by: 'x' }, { id: 'b' }, { id: 'a' }, { nope: true }] }),
      );
      expect(await service.listUpstreamModels({}, egress)).toEqual([{ id: 'a', ownedBy: 'x' }, { id: 'b' }]);
      expect(fetch).toHaveBeenCalledWith('https://p.example/v1/models', {
        headers: { Authorization: 'Bearer sk-stored' },
      });
    });

    it('takes an override before anything is saved', async () => {
      const { service } = createSettings();
      const { egress, fetch } = egressAnswering(Response.json({ data: [] }));
      await service.listUpstreamModels({ apiKey: 'sk-try', baseUrl: 'https://try.example/' }, egress);
      expect(fetch).toHaveBeenCalledWith('https://try.example/models', { headers: { Authorization: 'Bearer sk-try' } });
    });

    it('400s without an endpoint or key, 502s on an upstream error or a network failure', async () => {
      const { service } = createSettings();
      const { egress } = egressAnswering(new Response('nope', { status: 401 }));
      await expect(service.listUpstreamModels({}, egress)).rejects.toThrow(BadRequestException);
      await expect(service.listUpstreamModels({ baseUrl: 'https://p' }, egress)).rejects.toThrow(BadRequestException);
      await expect(service.listUpstreamModels({ apiKey: 'k', baseUrl: 'https://p' }, egress)).rejects.toThrow(
        BadGatewayException,
      );
      const failing: IBackendEgress = {
        fetch: () => Promise.reject(new Error('blocked')),
        resolveHost: (host) => Promise.resolve(host),
      };
      await expect(service.listUpstreamModels({ apiKey: 'k', baseUrl: 'https://p' }, failing)).rejects.toThrow(
        /Could not reach the provider: blocked/,
      );
    });
  });
});
