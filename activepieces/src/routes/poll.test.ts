import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { TriggerStrategy } from '@activepieces/shared';
import type { Piece } from '@activepieces/pieces-framework';
import { createApp } from '../app.js';
import { getPiece } from '../pieces/registry.js';
import { resolveAuthValue } from '../pieces/auth-resolver.js';

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

/** `poll.ts` keeps its `onEnable`-tracking state in module-level `Map`s for the process's lifetime
 * (see its own comment) — every test below uses its own unique trigger name so runs don't bleed into
 * each other despite that shared state. */
describe('POST /credentials/:credentialId/pieces/:pieceName/triggers/:triggerName/poll', () => {
  it('calls onEnable exactly once (on the first poll) then run() on every poll, forwarding items', async () => {
    const onEnable = vi.fn().mockResolvedValue(undefined);
    const run = vi.fn().mockResolvedValue([{ id: '1' }]);
    vi.mocked(getPiece).mockReturnValue({
      getTrigger: () => ({ type: TriggerStrategy.POLLING, onEnable, run }),
    } as unknown as Piece);

    const app = createApp();
    const first = await authedPost(app, '/credentials/cred-1/pieces/mock/triggers/first-poll-test/poll').send({
      propsValue: {},
      ...PROJECT_FIELDS,
    });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ items: [{ id: '1' }] });
    expect(onEnable).toHaveBeenCalledOnce();

    const second = await authedPost(app, '/credentials/cred-1/pieces/mock/triggers/first-poll-test/poll').send({
      propsValue: {},
      ...PROJECT_FIELDS,
    });
    expect(second.status).toBe(200);
    expect(onEnable).toHaveBeenCalledOnce(); // still once — not re-enabled on the second tick
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('400s a trigger that is not a POLLING trigger (e.g. a callback/webhook trigger)', async () => {
    vi.mocked(getPiece).mockReturnValue({
      getTrigger: () => ({ type: TriggerStrategy.WEBHOOK, onEnable: vi.fn(), run: vi.fn() }),
    } as unknown as Piece);

    const res = await authedPost(createApp(), '/credentials/cred-1/pieces/mock/triggers/webhook-poll-test/poll').send({
      propsValue: {},
      ...PROJECT_FIELDS,
    });

    expect(res.status).toBe(400);
  });

  it('404s when the trigger does not exist on the piece', async () => {
    vi.mocked(getPiece).mockReturnValue({ getTrigger: () => undefined } as unknown as Piece);

    const res = await authedPost(
      createApp(),
      '/credentials/cred-1/pieces/mock/triggers/does-not-exist-poll-test/poll',
    ).send({ propsValue: {}, ...PROJECT_FIELDS });

    expect(res.status).toBe(404);
  });

  it('400s when projectId/internalProjectToken are missing', async () => {
    const res = await authedPost(
      createApp(),
      '/credentials/cred-1/pieces/mock/triggers/missing-project-poll-test/poll',
    ).send({ propsValue: {} });

    expect(res.status).toBe(400);
  });
});
