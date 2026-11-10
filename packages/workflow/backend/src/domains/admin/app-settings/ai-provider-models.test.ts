import { describe, expect, it } from 'vitest';
import { parseAiProviderModels, readStoredAiProviderModels } from './ai-provider-models.js';

describe('parseAiProviderModels', () => {
  it('normalises ids and labels, drops an empty label', () => {
    expect(
      parseAiProviderModels([
        { id: ' gpt-4o-mini ', label: ' GPT-4o mini ', kind: 'chat' },
        { id: 'dall-e-3', label: '  ', kind: 'image' },
        { id: 'whisper-1', kind: 'transcribe' },
      ]),
    ).toEqual({
      ok: true,
      models: [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
        { id: 'dall-e-3', kind: 'image' },
        { id: 'whisper-1', kind: 'transcribe' },
      ],
    });
  });

  it('accepts an empty list and the same id under two kinds', () => {
    expect(parseAiProviderModels([])).toEqual({ ok: true, models: [] });
    const parsed = parseAiProviderModels([
      { id: 'omni', kind: 'chat' },
      { id: 'omni', kind: 'image' },
    ]);
    expect(parsed.ok).toBe(true);
  });

  it('lists every problem', () => {
    const parsed = parseAiProviderModels([
      { id: '', kind: 'chat' },
      { id: 'a', kind: 'video' },
      'not-an-object',
      { id: 'b', kind: 'chat', label: 5 },
      { id: 'c', kind: 'chat' },
      { id: ' c', kind: 'chat' },
    ]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual([
      'models[0].id: must be a non-empty string',
      'models[1].kind: must be one of chat, image, transcribe',
      'models[2]: must be an object { id, label?, kind }',
      'models[3].label: must be a string',
      'models[5].id: "c" is listed twice for kind "chat"',
    ]);
  });

  it('rejects a non-array', () => {
    expect(parseAiProviderModels({ id: 'x' })).toEqual({ ok: false, errors: ['models: must be an array'] });
  });
});

describe('readStoredAiProviderModels', () => {
  it('reads valid JSON and treats anything else as empty', () => {
    expect(readStoredAiProviderModels(JSON.stringify([{ id: 'm', kind: 'chat' }]))).toEqual([
      { id: 'm', kind: 'chat' },
    ]);
    expect(readStoredAiProviderModels(null)).toEqual([]);
    expect(readStoredAiProviderModels('{bad')).toEqual([]);
    expect(readStoredAiProviderModels('[{"id":""}]')).toEqual([]);
  });
});
