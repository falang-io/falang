import { describe, expect, it } from 'vitest';
import type { IAgentSettings } from '@falang/desktop-llm-client';
import { AgentSettingsStore } from './agent-settings-store.js';

const SETTINGS: IAgentSettings = { apiKey: 'k', baseUrl: 'https://example.test/v1', model: 'm' };

describe('AgentSettingsStore', () => {
  it('is not configured until settings with a base URL and model are loaded', async () => {
    const store = new AgentSettingsStore(() => Promise.resolve(null));
    expect(store.loading).toBe(true);
    await store.load();
    expect(store.loading).toBe(false);
    expect(store.configured).toBe(false);
    expect(store.model).toBeNull();
  });

  it('becomes configured after apply() without reloading', async () => {
    const store = new AgentSettingsStore(() => Promise.resolve(null));
    await store.load();
    store.apply(SETTINGS);
    expect(store.configured).toBe(true);
    expect(store.model).toBe('m');
  });

  it('keeps an applied value over a load that started before it', async () => {
    const loaded: { resolve?: (value: IAgentSettings | null) => void } = {};
    const store = new AgentSettingsStore(
      () =>
        new Promise((resolve) => {
          loaded.resolve = resolve;
        }),
    );
    const pending = store.load();
    store.apply(SETTINGS);
    loaded.resolve?.(null);
    await pending;
    expect(store.configured).toBe(true);
  });

  it('treats a failed load as not configured', async () => {
    const store = new AgentSettingsStore(() => Promise.reject(new Error('ipc')));
    await store.load();
    expect(store.loading).toBe(false);
    expect(store.configured).toBe(false);
  });
});
