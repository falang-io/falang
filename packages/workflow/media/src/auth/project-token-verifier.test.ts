import { describe, expect, it, vi } from 'vitest';
import { createProjectTokenVerifier } from './project-token-verifier.js';

const respond = (status: number) => vi.fn(() => Promise.resolve(new Response('{}', { status })));

describe('project token verifier', () => {
  it('returns ok on 200, posts projectId with the token header and caches the answer', async () => {
    const fetchFn = respond(200);
    let t = 0;
    const verify = createProjectTokenVerifier({ backendInternalUrl: 'http://b', fetchFn, now: () => t });
    expect(await verify('p1', 'tok')).toBe('ok');
    expect(await verify('p1', 'tok')).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://b/internal/auth/verify-project-token');
    expect((init.headers as Record<string, string>)['x-internal-project-token']).toBe('tok');
    expect(init.body).toBe(JSON.stringify({ projectId: 'p1' }));
    t = 61_000;
    await verify('p1', 'tok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not share a cache entry between projects', async () => {
    const fetchFn = respond(200);
    const verify = createProjectTokenVerifier({ backendInternalUrl: 'http://b', fetchFn });
    await verify('p1', 'tok');
    await verify('p2', 'tok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('denies a 403 and never caches it', async () => {
    const fetchFn = respond(403);
    const verify = createProjectTokenVerifier({ backendInternalUrl: 'http://b', fetchFn });
    expect(await verify('p1', 'bad')).toBe('denied');
    expect(await verify('p1', 'bad')).toBe('denied');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('fails closed when backend is unreachable, errors or is not configured', async () => {
    const down = createProjectTokenVerifier({
      backendInternalUrl: 'http://b',
      fetchFn: vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    });
    expect(await down('p1', 't')).toBe('unavailable');
    expect(await createProjectTokenVerifier({ backendInternalUrl: 'http://b', fetchFn: respond(502) })('p1', 't')).toBe(
      'unavailable',
    );
    expect(await createProjectTokenVerifier({ backendInternalUrl: '', fetchFn: respond(200) })('p1', 't')).toBe(
      'unavailable',
    );
  });
});
