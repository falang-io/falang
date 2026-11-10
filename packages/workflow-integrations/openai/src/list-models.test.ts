import { describe, expect, it, vi } from 'vitest';
import type { IFieldOptionsContext } from '@falang/workflow-integrations-common';
import { CALL_AI_CHOICE_NAME, CALL_AI_IMAGE_NAME, CALL_AI_TEXT_NAME } from './constants.js';
import { fetchOpenAiModelOptions, loadOpenAiModelOptions } from './list-models.js';
import { openaiIntegration } from './openai.integration.js';

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

describe('model options on the built-in AI provider (ADR 0081)', () => {
  const platformModels = [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
    { id: 'deepseek-chat', label: 'deepseek-chat', kind: 'chat' },
    { id: 'dall-e-3', label: 'DALL·E 3', kind: 'image' },
    { id: 'whisper-1', label: 'whisper-1', kind: 'transcribe' },
  ] as const;
  const ctx = (models: IFieldOptionsContext['platformModels'] | null): IFieldOptionsContext => ({
    instance: { id: 'ai', vendor: 'openai', name: 'AI', fields: {}, platformProvider: true },
    vendorData: {},
    egress: { fetch: vi.fn(), resolveHost: vi.fn() },
    ...(models ? { platformModels: models } : {}),
  });
  const modelField = (name: string) => {
    const action = openaiIntegration.actions.find((candidate) => candidate.name === name);
    const choice = openaiIntegration.choices?.find((candidate) => candidate.name === name);
    const fields = action?.fields ?? choice?.contextFields ?? [];
    const field = fields.find((candidate) => candidate.name === 'model');
    if (!field?.loadOptions) throw new Error(`no model loadOptions on ${name}`);
    return field.loadOptions;
  };

  it('answers text/choice with chat models and image with image models, without any upstream call', async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    try {
      const context = ctx(platformModels);
      const chat = [
        { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { value: 'deepseek-chat', label: 'deepseek-chat' },
      ];
      expect(await modelField(CALL_AI_TEXT_NAME)({ baseUrl: '', apiKey: '' }, context)).toEqual(chat);
      expect(await modelField(CALL_AI_CHOICE_NAME)({ baseUrl: '', apiKey: '' }, context)).toEqual(chat);
      expect(await modelField(CALL_AI_IMAGE_NAME)({ baseUrl: '', apiKey: '' }, context)).toEqual([
        { value: 'dall-e-3', label: 'DALL·E 3' },
      ]);
      expect(context.egress?.fetch).not.toHaveBeenCalled();
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('answers an empty list when the provider is off (empty platformModels)', async () => {
    const context = ctx([]);
    expect(await loadOpenAiModelOptions('chat')({ baseUrl: 'http://x', apiKey: 'k' }, context)).toEqual([]);
    expect(context.egress?.fetch).not.toHaveBeenCalled();
  });

  it('still lists the instance endpoint without platformModels', async () => {
    const guardedFetch = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'own-model' }] }));
    const context = { ...ctx(null), egress: { fetch: guardedFetch, resolveHost: vi.fn() } };
    expect(await loadOpenAiModelOptions('chat')({ baseUrl: 'http://x', apiKey: 'k' }, context)).toEqual([
      { value: 'own-model', label: 'own-model' },
    ]);
  });
});
