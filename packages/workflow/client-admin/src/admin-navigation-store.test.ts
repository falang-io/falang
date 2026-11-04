import { describe, expect, it } from 'vitest';
import { AdminNavigationStore, isAdminPageAvailable } from './admin-navigation-store.js';

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

  it('switches to the proxy page', () => {
    const store = new AdminNavigationStore();
    store.setPage('proxy');
    expect(store.page).toBe('proxy');
  });

  it('switches to an extension page', () => {
    const store = new AdminNavigationStore();
    store.setPage('ext:billing');
    expect(store.page).toBe('ext:billing');
  });

  it('switches to the agent settings page', () => {
    const store = new AdminNavigationStore();
    store.setPage('agent-settings');
    expect(store.page).toBe('agent-settings');
  });
});

describe('isAdminPageAvailable', () => {
  it('offers every page in a multi-user deployment', () => {
    expect(isAdminPageAvailable('users', false)).toBe(true);
    expect(isAdminPageAvailable('support', false)).toBe(true);
  });

  it('drops users and support in a single-user deployment', () => {
    expect(isAdminPageAvailable('users', true)).toBe(false);
    expect(isAdminPageAvailable('support', true)).toBe(false);
    expect(isAdminPageAvailable('agent-settings', true)).toBe(true);
    expect(isAdminPageAvailable('oauth-credentials', true)).toBe(true);
  });
});
