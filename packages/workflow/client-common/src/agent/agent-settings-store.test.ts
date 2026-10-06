import { describe, expect, it, vi } from 'vitest';

vi.mock('../api-client.js', () => ({ workflowApi: { getAgentSettings: vi.fn() } }));

import { workflowApi } from '../api-client.js';
import { AgentSettingsStore } from './agent-settings-store.js';

describe('AgentSettingsStore', () => {
  it('reads configured and stops loading', async () => {
    vi.mocked(workflowApi.getAgentSettings).mockResolvedValueOnce({ configured: true });
    const store = new AgentSettingsStore();
    expect(store.loading).toBe(true);
    await store.load();
    expect(store).toMatchObject({ configured: true, loading: false });
  });

  it('treats a failed request as not configured', async () => {
    vi.mocked(workflowApi.getAgentSettings).mockRejectedValueOnce(new Error('boom'));
    const store = new AgentSettingsStore();
    await store.load();
    expect(store).toMatchObject({ configured: false, loading: false });
  });
});
