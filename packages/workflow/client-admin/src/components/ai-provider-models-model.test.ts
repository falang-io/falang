import { describe, expect, it } from 'vitest';
import {
  addUpstreamModels,
  emptyModelRow,
  guessModelKind,
  rowsToModels,
  toModelRows,
} from './ai-provider-models-model.js';

describe('built-in AI provider models table (ADR 0081)', () => {
  it('round-trips models through rows, trimming and dropping empty labels and empty rows', () => {
    const rows = toModelRows([
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
      { id: 'dall-e-3', kind: 'image' },
    ]);
    expect(rows.map((row) => row.label)).toEqual(['GPT-4o mini', '']);
    const edited = [...rows, { ...emptyModelRow(), id: '  whisper-1 ', kind: 'transcribe' as const }, emptyModelRow()];
    expect(rowsToModels(edited)).toEqual([
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
      { id: 'dall-e-3', kind: 'image' },
      { id: 'whisper-1', kind: 'transcribe' },
    ]);
  });

  it('adds picked upstream ids once per kind', () => {
    const rows = toModelRows([{ id: 'gpt-4o', kind: 'chat' }]);
    const next = addUpstreamModels(rows, ['gpt-4o', 'gpt-4o-mini', 'gpt-4o-mini'], 'chat');
    expect(next.map((row) => `${row.kind}:${row.id}`)).toEqual(['chat:gpt-4o', 'chat:gpt-4o-mini']);
    expect(addUpstreamModels(rows, ['gpt-4o'], 'image').map((row) => `${row.kind}:${row.id}`)).toEqual([
      'chat:gpt-4o',
      'image:gpt-4o',
    ]);
    expect(new Set(next.map((row) => row.key)).size).toBe(next.length);
  });

  it('guesses a kind from the model id', () => {
    expect(guessModelKind('dall-e-3')).toBe('image');
    expect(guessModelKind('gpt-image-1')).toBe('image');
    expect(guessModelKind('whisper-1')).toBe('transcribe');
    expect(guessModelKind('gpt-4o-transcribe')).toBe('transcribe');
    expect(guessModelKind('deepseek-chat')).toBe('chat');
  });
});
