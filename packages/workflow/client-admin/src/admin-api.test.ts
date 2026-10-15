import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@falang/workflow-client-common', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

const { adminApi } = await import('./admin-api.js');

describe('adminApi.listUserRunnerSessions', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ sessions: [] });
  });

  it('sends no query string without params', async () => {
    await adminApi.listUserRunnerSessions('u1');
    expect(apiRequest).toHaveBeenCalledWith('/admin/users/u1/runner-sessions');
  });

  it('adds limit and before to the query', async () => {
    await adminApi.listUserRunnerSessions('u1', { limit: 50, before: '2026-01-01T00:00:00Z' });
    expect(apiRequest).toHaveBeenCalledWith('/admin/users/u1/runner-sessions?limit=50&before=2026-01-01T00%3A00%3A00Z');
  });

  it('keeps limit 0 and omits an empty before', async () => {
    await adminApi.listUserRunnerSessions('u1', { limit: 0, before: '' });
    expect(apiRequest).toHaveBeenCalledWith('/admin/users/u1/runner-sessions?limit=0');
  });
});

describe('adminApi.createUser', () => {
  beforeEach(() => apiRequest.mockReset());

  it('omits an empty email from the body', async () => {
    await adminApi.createUser('bob');
    expect(JSON.parse(apiRequest.mock.calls[0]?.[1].body)).toEqual({ username: 'bob' });
  });

  it('sends the email when given', async () => {
    await adminApi.createUser('bob', 'b@x.io');
    expect(JSON.parse(apiRequest.mock.calls[0]?.[1].body)).toEqual({ username: 'bob', email: 'b@x.io' });
  });
});
