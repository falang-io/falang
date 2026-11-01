import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetGuestProjectDraft, readGuestProjectDraft, saveGuestProjectDraft } from './guest-project-draft.js';

const DAY = 24 * 60 * 60 * 1000;
const state = { folders: [], documents: [] };

describe('guest project draft', () => {
  const data = new Map<string, string>();

  beforeEach(() => {
    data.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps a draft for 30 days', () => {
    expect(saveGuestProjectDraft({ templateKey: 'bot', name: 'Bot', state }, 1000)).toBe(true);
    expect(readGuestProjectDraft(1000 + 29 * DAY)).toMatchObject({ templateKey: 'bot', name: 'Bot', state });
    expect(readGuestProjectDraft(1000 + 31 * DAY)).toBeNull();
    expect(data.size).toBe(0);
  });

  it('drops a malformed draft and forgets on request', () => {
    data.set('falang:guest-project-draft', JSON.stringify({ version: 1, templateKey: 'bot' }));
    expect(readGuestProjectDraft()).toBeNull();
    expect(data.size).toBe(0);
    saveGuestProjectDraft({ templateKey: 'bot', name: 'Bot', state });
    forgetGuestProjectDraft();
    expect(readGuestProjectDraft()).toBeNull();
  });

  it('copes with missing or full storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => null,
    });
    expect(saveGuestProjectDraft({ templateKey: 'bot', name: 'Bot', state })).toBe(false);
    vi.stubGlobal('localStorage', null);
    expect(saveGuestProjectDraft({ templateKey: 'bot', name: 'Bot', state })).toBe(false);
    expect(readGuestProjectDraft()).toBeNull();
  });
});
