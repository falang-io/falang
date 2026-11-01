import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IApiProject } from '../api-types.js';
import { readPendingTemplate, rememberPendingTemplate } from '../pending-template.js';
import { claimGuestProjectDraft } from './claim-guest-project-draft.js';
import { readGuestProjectDraft, saveGuestProjectDraft } from './guest-project-draft.js';

const state = {
  folders: [{ id: 'sec', name: 'Functions', parentId: null, fixedKind: 'functions' }],
  documents: [{ id: 'fn', type: 'function', name: 'run', folderId: 'sec', pinned: false, root: null, data: null }],
};

const project = { id: 'p-1', name: 'Bot' } as IApiProject;

describe('claimGuestProjectDraft', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const nav = () => ({ closeTemplate: vi.fn(), selectProject: vi.fn() });

  it('does nothing without a draft', () => {
    const store = { createProjectFromGuestDraft: vi.fn() };
    expect(claimGuestProjectDraft(store, nav())).toBe(false);
    expect(store.createProjectFromGuestDraft).not.toHaveBeenCalled();
  });

  it('imports the draft as a new project, forgets it and opens the project', async () => {
    saveGuestProjectDraft({ templateKey: 'bot', name: 'Bot', state });
    rememberPendingTemplate('bot');
    const navigation = nav();
    const store = { createProjectFromGuestDraft: vi.fn().mockResolvedValue(project) };

    expect(claimGuestProjectDraft(store, navigation)).toBe(true);
    // A second mount while the import runs doesn't import again.
    expect(claimGuestProjectDraft(store, navigation)).toBe(true);
    expect(readPendingTemplate()).toBeNull();
    expect(navigation.closeTemplate).toHaveBeenCalled();
    await vi.waitFor(() => expect(navigation.selectProject).toHaveBeenCalledWith('p-1', 'Bot'));

    expect(store.createProjectFromGuestDraft).toHaveBeenCalledTimes(1);
    expect(store.createProjectFromGuestDraft).toHaveBeenCalledWith('bot', {
      formatVersion: 1,
      project: { id: '', name: 'Bot' },
      folders: [{ id: 'sec', name: 'Functions', parentId: null, fixedKind: 'functions' }],
      documents: [{ id: 'fn', type: 'function', name: 'run', folderId: 'sec', pinned: false, root: null, data: null }],
    });
    expect(readGuestProjectDraft()).toBeNull();
  });

  it('keeps the draft when the import fails', async () => {
    saveGuestProjectDraft({ templateKey: 'bot', name: 'Bot', state });
    const navigation = nav();
    const store = { createProjectFromGuestDraft: vi.fn().mockResolvedValue(null) };
    expect(claimGuestProjectDraft(store, navigation)).toBe(true);
    await vi.waitFor(() => expect(store.createProjectFromGuestDraft).toHaveBeenCalled());
    await Promise.resolve();
    expect(navigation.selectProject).not.toHaveBeenCalled();
    expect(readGuestProjectDraft()).not.toBeNull();
  });
});
