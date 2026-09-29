import { describe, expect, it } from 'vitest';
import { AdminNavigationStore } from './admin-navigation-store.js';

describe('AdminNavigationStore', () => {
  it('defaults to the users page', () => {
    const store = new AdminNavigationStore();
    expect(store.page).toBe('users');
  });

  it('switches to the requested page', () => {
    const store = new AdminNavigationStore();
    store.setPage('oauth-credentials');
    expect(store.page).toBe('oauth-credentials');
  });

  it('switches to the agent settings page', () => {
    const store = new AdminNavigationStore();
    store.setPage('agent-settings');
    expect(store.page).toBe('agent-settings');
  });
});
