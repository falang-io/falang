import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Piece } from '@activepieces/pieces-framework';
import { createApp } from '../app.js';
import { getPiece } from '../pieces/registry.js';
import { resolveAuthValue } from '../pieces/auth-resolver.js';
import { NotFoundError } from '../credentials.js';

vi.mock('../pieces/registry.js', () => ({ getPiece: vi.fn() }));
vi.mock('../pieces/auth-resolver.js', () => ({ resolveAuthValue: vi.fn() }));

const SECRET = 'test-secret';
const authedPost = (app: ReturnType<typeof createApp>, path: string) =>
  request(app).post(path).set('x-internal-api-key', SECRET);

beforeEach(() => {
  process.env.ACTIVEPIECES_SERVICE_SECRET = SECRET;
  vi.mocked(resolveAuthValue).mockResolvedValue({ type: 'SECRET_TEXT', secret_text: 'sk-1' });
});

const PROJECT_FIELDS = { projectId: 'project-1', internalProjectToken: 'ptok' };

describe('POST /credentials/:credentialId/pieces/:pieceName/actions/:actionName/run', () => {
  it('runs the action with the resolved auth value plugged in and returns its result', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    vi.mocked(getPiece).mockReturnValue({ getAction: () => ({ run }) } as unknown as Piece);

    const res = await authedPost(createApp(), '/credentials/cred-1/pieces/mock/actions/create_item/run').send({
      propsValue: { title: 'hello' },
      ...PROJECT_FIELDS,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: { ok: true } });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ propsValue: { title: 'hello' }, auth: { type: 'SECRET_TEXT', secret_text: 'sk-1' } }),
    );
    expect(resolveAuthValue).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'cred-1', 'project-1', 'ptok');
  });

  it('404s when the action does not exist on the piece', async () => {
    vi.mocked(getPiece).mockReturnValue({ getAction: () => undefined } as unknown as Piece);

    const res = await authedPost(createApp(), '/credentials/cred-1/pieces/mock/actions/does_not_exist/run').send({
      propsValue: {},
      ...PROJECT_FIELDS,
    });

    expect(res.status).toBe(404);
  });

  it('404s when the credential cannot be resolved', async () => {
    vi.mocked(getPiece).mockReturnValue({ getAction: () => ({ run: vi.fn() }) } as unknown as Piece);
    vi.mocked(resolveAuthValue).mockRejectedValue(new NotFoundError('no such credential'));

    const res = await authedPost(createApp(), '/credentials/missing/pieces/mock/actions/create_item/run').send({
      propsValue: {},
      ...PROJECT_FIELDS,
    });

    expect(res.status).toBe(404);
  });

  it('400s when projectId/internalProjectToken are missing', async () => {
    const res = await authedPost(createApp(), '/credentials/cred-1/pieces/mock/actions/create_item/run').send({
      propsValue: {},
    });

    expect(res.status).toBe(400);
  });

  it('rejects requests without the internal service secret header', async () => {
    const res = await request(createApp())
      .post('/credentials/cred-1/pieces/mock/actions/create_item/run')
      .send({ propsValue: {}, ...PROJECT_FIELDS });

    expect(res.status).toBe(401);
  });
});
