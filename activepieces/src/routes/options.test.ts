import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Piece } from '@activepieces/pieces-framework';
import { createApp } from '../app.js';
import { getPiece } from '../pieces/registry.js';
import { resolveAuthValue } from '../pieces/auth-resolver.js';

vi.mock('../pieces/registry.js', () => ({ getPiece: vi.fn() }));
vi.mock('../pieces/auth-resolver.js', () => ({ resolveAuthValue: vi.fn() }));

const SECRET = 'test-secret';
const authedGet = (app: ReturnType<typeof createApp>, path: string) =>
  request(app).get(path).set('x-internal-api-key', SECRET);

beforeEach(() => {
  process.env.ACTIVEPIECES_SERVICE_SECRET = SECRET;
  vi.mocked(resolveAuthValue).mockResolvedValue({ type: 'SECRET_TEXT', secret_text: 'sk-1' });
});

const PROJECT_QUERY = { projectId: 'project-1', internalProjectToken: 'ptok' };

describe('GET /credentials/:credentialId/pieces/:pieceName/actions/:actionName/fields/:fieldName/options', () => {
  it('resolves a dynamic Dropdown field by calling its options() with auth plugged in plus the given propsValue', async () => {
    const options = vi.fn().mockResolvedValue({ options: [{ label: 'A', value: 'a' }] });
    vi.mocked(getPiece).mockReturnValue({
      getAction: () => ({ props: { assignee: { type: 'DROPDOWN', options } } }),
    } as unknown as Piece);

    const res = await authedGet(
      createApp(),
      '/credentials/cred-1/pieces/mock/actions/create_item/fields/assignee/options',
    ).query({ propsValue: JSON.stringify({ status: 'open' }), ...PROJECT_QUERY });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ options: [{ label: 'A', value: 'a' }] });
    expect(options).toHaveBeenCalledWith(
      { status: 'open', auth: { type: 'SECRET_TEXT', secret_text: 'sk-1' } },
      expect.anything(),
    );
    expect(resolveAuthValue).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'cred-1', 'project-1', 'ptok');
  });

  it('defaults propsValue to {} when the query param is omitted', async () => {
    const options = vi.fn().mockResolvedValue({ options: [] });
    vi.mocked(getPiece).mockReturnValue({
      getAction: () => ({ props: { assignee: { type: 'DROPDOWN', options } } }),
    } as unknown as Piece);

    await authedGet(createApp(), '/credentials/cred-1/pieces/mock/actions/create_item/fields/assignee/options').query(
      PROJECT_QUERY,
    );

    expect(options).toHaveBeenCalledWith({ auth: { type: 'SECRET_TEXT', secret_text: 'sk-1' } }, expect.anything());
  });

  it('400s malformed propsValue JSON', async () => {
    vi.mocked(getPiece).mockReturnValue({ getAction: () => ({ props: {} }) } as unknown as Piece);

    const res = await authedGet(
      createApp(),
      '/credentials/cred-1/pieces/mock/actions/create_item/fields/assignee/options',
    ).query({ propsValue: '{not json', ...PROJECT_QUERY });

    expect(res.status).toBe(400);
  });

  it('404s an unknown field', async () => {
    vi.mocked(getPiece).mockReturnValue({ getAction: () => ({ props: {} }) } as unknown as Piece);

    const res = await authedGet(
      createApp(),
      '/credentials/cred-1/pieces/mock/actions/create_item/fields/does_not_exist/options',
    ).query(PROJECT_QUERY);

    expect(res.status).toBe(404);
  });

  it("400s a field that isn't a dynamic dropdown (e.g. a plain ShortText)", async () => {
    vi.mocked(getPiece).mockReturnValue({
      getAction: () => ({ props: { title: { type: 'SHORT_TEXT' } } }),
    } as unknown as Piece);

    const res = await authedGet(
      createApp(),
      '/credentials/cred-1/pieces/mock/actions/create_item/fields/title/options',
    ).query(PROJECT_QUERY);

    expect(res.status).toBe(400);
  });

  it('404s when the action itself does not exist', async () => {
    vi.mocked(getPiece).mockReturnValue({ getAction: () => undefined } as unknown as Piece);

    const res = await authedGet(
      createApp(),
      '/credentials/cred-1/pieces/mock/actions/does_not_exist/fields/title/options',
    ).query(PROJECT_QUERY);

    expect(res.status).toBe(404);
  });

  it('400s when projectId/internalProjectToken query params are missing', async () => {
    const res = await authedGet(
      createApp(),
      '/credentials/cred-1/pieces/mock/actions/create_item/fields/assignee/options',
    );

    expect(res.status).toBe(400);
  });
});
