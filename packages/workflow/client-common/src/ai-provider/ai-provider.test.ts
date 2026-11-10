import { describe, expect, it } from 'vitest';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  chatModelsOf,
  isHiddenByAiProvider,
  resolvePlatformProvider,
  shouldShowAiProviderSwitch,
} from './ai-provider-model.js';
import { DEFAULT_AI_PROVIDER_NAME_KEY, resolveAiProviderName } from './ai-provider-name.js';
import { AiProviderStore } from './ai-provider-store.js';

const capable: Pick<IWorkflowIntegration, 'builtInProvider'> = { builtInProvider: true };
const other: Pick<IWorkflowIntegration, 'builtInProvider'> = {};

describe('ai-provider-model (ADR 0081)', () => {
  it('offers the switch on a capable vendor when configured, or when the instance already has the flag', () => {
    expect(shouldShowAiProviderSwitch(capable, true, false)).toBe(true);
    expect(shouldShowAiProviderSwitch(capable, false, true)).toBe(true);
    expect(shouldShowAiProviderSwitch(capable, false, false)).toBe(false);
    expect(shouldShowAiProviderSwitch(other, true, true)).toBe(false);
    expect(shouldShowAiProviderSwitch(null, true, false)).toBe(false);
  });

  it('persists and hides only for a capable vendor with the switch on', () => {
    expect(resolvePlatformProvider(capable, true)).toBe(true);
    expect(resolvePlatformProvider(capable, false)).toBe(false);
    expect(resolvePlatformProvider(other, true)).toBe(false);
    expect(isHiddenByAiProvider(capable, true)).toBe(true);
    expect(isHiddenByAiProvider(other, true)).toBe(false);
  });

  it('chatModelsOf keeps the chat models', () => {
    expect(
      chatModelsOf([
        { id: 'a', label: 'a', kind: 'chat' },
        { id: 'b', label: 'b', kind: 'image' },
      ]).map((model) => model.id),
    ).toEqual(['a']);
  });
});

const t = (key: string): string => `t(${key})`;

describe('resolveAiProviderName', () => {
  it('uses the host string for the language, then its base language, else the i18n default', () => {
    const names = { ru: 'ИИ Шагомата', en: 'Shagomat AI' };
    expect(resolveAiProviderName(names, 'ru', t)).toBe('ИИ Шагомата');
    expect(resolveAiProviderName(names, 'ru-RU', t)).toBe('ИИ Шагомата');
    expect(resolveAiProviderName(names, 'de', t)).toBe(`t(${DEFAULT_AI_PROVIDER_NAME_KEY})`);
    expect(resolveAiProviderName({}, 'en', t)).toBe(`t(${DEFAULT_AI_PROVIDER_NAME_KEY})`);
  });
});

describe('AiProviderStore', () => {
  it('loads once and exposes the models of every kind to the agent only when configured', async () => {
    let calls = 0;
    const store = new AiProviderStore(() => {
      calls += 1;
      return Promise.resolve({
        configured: true,
        models: [
          { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' as const },
          { id: 'dall-e-3', label: 'dall-e-3', kind: 'image' as const },
          { id: 'whisper-1', label: 'Whisper', kind: 'transcribe' as const },
        ],
      });
    });
    expect(store.info).toBeNull();
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    expect(calls).toBe(1);
    expect(store.loaded).toBe(true);
    expect(store.info).toEqual({
      chatModels: [{ id: 'gpt-4o-mini', label: 'GPT-4o mini' }],
      imageModels: [{ id: 'dall-e-3', label: 'dall-e-3' }],
      transcribeModels: [{ id: 'whisper-1', label: 'Whisper' }],
    });
  });

  it('reads a failed request as not configured', async () => {
    const store = new AiProviderStore(() => Promise.reject(new Error('401')));
    await store.ensureLoaded();
    expect(store.configured).toBe(false);
    expect(store.loaded).toBe(true);
    expect(store.info).toBeNull();
  });
});
