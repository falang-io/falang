import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isTablesNonRetryable,
  tablesDeleteRecords,
  tablesGetRecord,
  tablesInsertRecord,
  tablesSelectRecords,
  tablesUpdateRecords,
} from './activity-helpers.js';

const fields = { name: 'f1', age: 'f2' };
const record = { id: 'r1', version: 1, createdAt: 'c', updatedAt: 'u', data: { f1: 'Ann', f9: 'x' } };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('table activity helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend:3001');
    vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'tok');
    vi.stubEnv('PROJECT_ID', 'proj 1');
    vi.stubEnv('WORKFLOW_ENV', 'prod');
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const lastCall = (): { url: string; headers: Record<string, string>; body: Record<string, unknown> } => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return {
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    };
  };

  it('select translates names to ids and back, with headers and env', async () => {
    fetchMock.mockResolvedValue(json({ records: [record] }));
    const rows = await tablesSelectRecords('t1', fields, {
      where: { name: 'Ann' },
      orderBy: 'age desc',
      limit: '5',
      offset: '',
    });
    const call = lastCall();
    expect(call.url).toBe('http://backend:3001/internal/projects/proj%201/tables/t1/select');
    expect(call.headers['x-internal-project-token']).toBe('tok');
    expect(call.body).toEqual({
      env: 'prod',
      where: { f1: 'Ann' },
      orderBy: [{ field: 'f2', dir: 'desc' }],
      limit: 5,
    });
    expect(rows).toEqual([{ name: 'Ann', id: 'r1', version: 1, createdAt: 'c', updatedAt: 'u' }]);
  });

  it('rejects a bad limit before any request', async () => {
    await expect(tablesSelectRecords('t1', fields, { limit: 'abc' })).rejects.toThrow('limit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('get posts the id', async () => {
    fetchMock.mockResolvedValue(json(record));
    const row = await tablesGetRecord('t1', fields, 'r1');
    expect(lastCall().body).toEqual({ env: 'prod', id: 'r1' });
    expect(row.name).toBe('Ann');
  });

  it('insert sends an idempotency key made of run and activity id', async () => {
    fetchMock.mockResolvedValue(json({ record, created: true }));
    const context = { runId: 'run-1', workflowId: 'wf', activityId: '7' };
    const row = await tablesInsertRecord('t1', fields, { name: 'Ann' }, context);
    expect(lastCall().body).toEqual({
      env: 'prod',
      data: { f1: 'Ann' },
      idempotencyKey: 'run-1:7',
      context,
    });
    expect(row.id).toBe('r1');
  });

  it('insert outside an activity is a non-retryable error', async () => {
    await expect(tablesInsertRecord('t1', fields, {}, {})).rejects.toSatisfy(isTablesNonRetryable);
  });

  it('update and delete need a non-blank where and return the affected count', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ affected: 3 })));
    const context = { runId: 'r', workflowId: 'w', activityId: '1' };
    await expect(tablesUpdateRecords('t1', fields, { age: 1 }, {}, context)).rejects.toThrow('non-empty where');
    await expect(tablesDeleteRecords('t1', fields, undefined, context)).rejects.toThrow('non-empty where');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await tablesUpdateRecords('t1', fields, { age: 1 }, { id: 'r1', version: 2 }, context)).toBe(3);
    expect(lastCall().body).toMatchObject({ set: { f2: 1 }, where: { id: 'r1', version: 2 } });
    expect(await tablesDeleteRecords('t1', fields, { name: 'Ann' }, context)).toBe(3);
    expect(lastCall().url.endsWith('/delete')).toBe(true);
  });

  it.each([400, 404, 409, 413])('maps %i to a non-retryable failure', async (status) => {
    fetchMock.mockResolvedValue(json({ code: 'validation', message: 'bad' }, status));
    const error = await tablesGetRecord('t1', fields, 'r1').catch((error_: unknown) => error_);
    expect(isTablesNonRetryable(error)).toBe(true);
    expect((error as Error).message).toContain('bad');
  });

  it('keeps 5xx and network failures retryable', async () => {
    fetchMock.mockResolvedValue(json({ message: 'boom' }, 503));
    const error = await tablesGetRecord('t1', fields, 'r1').catch((error_: unknown) => error_);
    expect(isTablesNonRetryable(error)).toBe(false);
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const network = await tablesGetRecord('t1', fields, 'r1').catch((error_: unknown) => error_);
    expect(isTablesNonRetryable(network)).toBe(false);
  });

  it('turns unknown_field into the removed-field message using the baked name', async () => {
    fetchMock.mockResolvedValue(json({ code: 'unknown_field', field: 'f2' }, 400));
    await expect(tablesSelectRecords('t1', fields, { where: { age: 1 } })).rejects.toThrow(
      'field "age" no longer exists',
    );
  });

  it('fails clearly without the pod env', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', '');
    await expect(tablesGetRecord('t1', fields, 'r1')).rejects.toThrow('not configured');
  });
});
